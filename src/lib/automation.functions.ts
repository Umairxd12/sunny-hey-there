import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const settingsSchema = z.object({
  country: z.literal("US"),
  timezone: z.string().min(3).max(64).refine((tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } }, "Unknown timezone"),
  frequency: z.enum(["daily", "specific_days", "custom"]),
  days_of_week: z.array(z.number().int().min(0).max(6)).max(7),
  publish_times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).max(12),
  custom_slots: z.array(z.string().datetime()).max(100),
  platforms: z.array(z.enum(["facebook", "youtube", "tiktok"])).max(3),
  account_ids: z.array(z.string().uuid()).max(50),
});

export const getAutomation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadSettings } = await import("./automation/automation.server");
    const [settings, { data: accounts }] = await Promise.all([
      loadSettings(context.supabase, context.userId),
      context.supabase.from("social_accounts").select("id, platform, account_name, status").eq("status", "connected").order("platform"),
    ]);
    return { settings, accounts: accounts ?? [] };
  });

export const saveAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => settingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("automation_settings").upsert({ user_id: context.userId, ...data, updated_at: new Date().toISOString() });
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });

export const setEmergencyStop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ stopped: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { loadSettings } = await import("./automation/automation.server");
    const s = await loadSettings(context.supabase, context.userId);
    const { error } = await context.supabase.from("automation_settings").upsert({
      ...s, emergency_stop: data.stopped, emergency_stopped_at: data.stopped ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
    });
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });

export const listCalendar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: posts }, { data: accounts }, { data: projects }] = await Promise.all([
      context.supabase.from("scheduled_posts").select("id, project_id, platform, social_account_id, title, caption, hashtags, status, status_detail, scheduled_for, published_at, published_url, external_post_id, last_error, attempts, max_attempts, automated, created_at").order("scheduled_for", { ascending: true, nullsFirst: false }).limit(500),
      context.supabase.from("social_accounts").select("id, platform, account_name, status"),
      context.supabase.from("projects").select("id, title"),
    ]);
    return { posts: posts ?? [], accounts: accounts ?? [], projects: projects ?? [] };
  });

/** Puts a READY/FAILED/DRAFT post on the schedule for a chosen account and time. */
export const schedulePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ postId: z.string().uuid(), accountId: z.string().uuid(), at: z.string().datetime() }).parse(d))
  .handler(async ({ data, context }) => {
    if (new Date(data.at).getTime() < Date.now() + 60_000) return { ok: false as const, error: "Pick a time at least one minute from now." };
    const { data: post } = await context.supabase.from("scheduled_posts").select("status, external_post_id").eq("id", data.postId).maybeSingle();
    if (!post) return { ok: false as const, error: "Post not found." };
    if (post.external_post_id) return { ok: false as const, error: "This video was already sent to the platform, so it can't be scheduled again." };
    if (!["DRAFT", "READY", "FAILED", "SCHEDULED"].includes(post.status)) return { ok: false as const, error: `A ${post.status.toLowerCase()} post can't be rescheduled.` };
    const { data: acc } = await context.supabase.from("social_accounts").select("platform, status").eq("id", data.accountId).maybeSingle();
    if (!acc || acc.status !== "connected") return { ok: false as const, error: "That account isn't connected." };
    const { error } = await context.supabase.from("scheduled_posts").update({
      status: "SCHEDULED", social_account_id: data.accountId, platform: acc.platform, scheduled_for: data.at, next_attempt_at: data.at,
      attempts: 0, last_error: null, status_detail: null, locked_until: null, updated_at: new Date().toISOString(),
    }).eq("id", data.postId);
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });

export const unschedulePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ postId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("scheduled_posts").update({ status: "READY", next_attempt_at: null, updated_at: new Date().toISOString() })
      .eq("id", data.postId).in("status", ["SCHEDULED", "RETRYING"]);
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });

/** Retry a failed post. Refused when the platform already holds a copy, to avoid duplicates. */
export const retryPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ postId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: post } = await context.supabase.from("scheduled_posts").select("status, external_post_id, social_account_id").eq("id", data.postId).maybeSingle();
    if (!post || post.status !== "FAILED") return { ok: false as const, error: "Only failed posts can be retried." };
    if (post.external_post_id) return { ok: false as const, error: "The platform already received this video. Check it there instead of posting again." };
    if (!post.social_account_id) return { ok: false as const, error: "Choose an account first using Schedule." };
    const { error } = await context.supabase.from("scheduled_posts").update({ status: "RETRYING", next_attempt_at: new Date().toISOString(), attempts: 0, locked_until: null, updated_at: new Date().toISOString() }).eq("id", data.postId);
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });

/** Review gate: APPROVE. Queues the finished video for immediate publishing to
 *  every connected account linked to the project. The publish-due worker picks
 *  the posts up within minutes and uploads them to the social platforms. */
export const approveAndPublishNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: project } = await db.from("projects").select("id, user_id, title, target_platform").eq("id", data.projectId).single();
    if (!project || project.user_id !== context.userId) return { ok: false as const, error: "Project not found." };

    const { data: finalAsset } = await db.from("video_assets").select("url").eq("project_id", data.projectId).eq("kind", "final").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: videoRow } = await db.from("videos").select("id").eq("project_id", data.projectId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!finalAsset?.url && !videoRow) return { ok: false as const, error: "No finished video yet — generate the video first." };

    // Caption + hashtags from the metadata stage (same parsing as the workspace).
    const { data: meta } = await db.from("pipeline_steps").select("output").eq("project_id", data.projectId).eq("step_key", "metadata").maybeSingle();
    const metaText = meta?.output ?? "";
    const hashtags = Array.from(new Set(metaText.match(/#[\p{L}\p{N}_]+/gu) ?? [])).join(" ");
    const caption = metaText.match(/caption[^\n]*:\s*(.+)/i)?.[1]?.trim() ?? "";

    // Target accounts: linked to the project, else the automation defaults — only connected ones.
    const { data: linked } = await db.from("project_social_accounts").select("account_id").eq("project_id", data.projectId);
    let accountIds = (linked ?? []).map((l) => l.account_id);
    if (!accountIds.length) {
      const { loadSettings } = await import("./automation/automation.server");
      accountIds = (await loadSettings(db, context.userId)).account_ids;
    }
    const { data: accounts } = accountIds.length
      ? await db.from("social_accounts").select("id, platform, account_name").in("id", accountIds).eq("status", "connected")
      : { data: [] as { id: string; platform: string; account_name: string | null }[] };
    if (!accounts?.length) return { ok: false as const, error: "No connected social account. Connect one on the Social accounts page first." };

    // Never touch a post the platform already received — approving twice must not re-publish.
    // Also skip posts currently being published by the worker/cron.
    const { data: sent } = await db.from("scheduled_posts").select("social_account_id").eq("project_id", data.projectId)
      .or("external_post_id.not.is.null,status.in.(PUBLISHING,PROCESSING,PUBLISHED)");
    const sentIds = new Set((sent ?? []).map((s) => s.social_account_id));
    const targets = accounts.filter((a) => !sentIds.has(a.id));
    if (!targets.length) return { ok: false as const, error: "This video was already sent to every connected account." };

    const now = new Date().toISOString();
    const rows = targets.map((a) => ({
      user_id: context.userId, project_id: data.projectId, video_id: videoRow?.id ?? null,
      platform: a.platform, social_account_id: a.id, title: project.title, caption: caption || null, hashtags: hashtags || null,
      status: "SCHEDULED", scheduled_for: now, next_attempt_at: now, attempts: 0, automated: false,
      idempotency_key: `${data.projectId}:${videoRow?.id ?? "novideo"}:${a.id}`,
      status_detail: "Approved — publishing now.",
    }));
    const { error } = await db.from("scheduled_posts").upsert(rows, { onConflict: "idempotency_key" });
    if (error) return { ok: false as const, error: error.message };
    await db.from("production_history").insert({ project_id: data.projectId, action: "Approved — publishing now", detail: `Queued for ${targets.length} account(s).` });
    const { logActivity } = await import("./jobs/jobs.server");
    await logActivity({ userId: context.userId, category: "publishing", level: "success", projectId: data.projectId, event: "Video approved — publishing now", detail: `${project.title} → ${targets.length} account(s)` });
    return { ok: true as const, queued: targets.length };
  });

/** Review gate: DELETE VIDEO. Removes the finished video (videos, clips, assets,
 *  audio tracks) and resets the video pipeline steps so the video can be
 *  regenerated. Script/storyboard/final-prompt stages are kept. Unsent posts
 *  are cancelled like a reject. */
export const deleteVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: project } = await db.from("projects").select("id, user_id, title").eq("id", data.projectId).single();
    if (!project || project.user_id !== context.userId) return { ok: false as const, error: "Project not found." };
    for (const table of ["videos", "video_clips", "video_assets", "video_audio_tracks"] as const) {
      const { error } = await db.from(table).delete().eq("project_id", data.projectId);
      if (error) return { ok: false as const, error: error.message };
    }
    const { error: stepErr } = await db.from("pipeline_steps").delete()
      .eq("project_id", data.projectId).in("step_key", ["generate_video", "video_analysis", "editing", "final_qa"]);
    if (stepErr) return { ok: false as const, error: stepErr.message };
    await db.from("scheduled_posts").update({ status: "CANCELLED", status_detail: "Video deleted by the owner.", updated_at: new Date().toISOString() })
      .eq("project_id", data.projectId).is("external_post_id", null)
      .in("status", ["DRAFT", "READY", "SCHEDULED", "RETRYING", "FAILED"]);
    const { data: finalPrompt } = await db.from("pipeline_steps").select("status")
      .eq("project_id", data.projectId).eq("step_key", "final_prompt").maybeSingle();
    const ready = finalPrompt?.status === "done";
    const now = new Date().toISOString();
    const { error: pErr } = await db.from("projects").update({
      status: ready ? "VIDEO_PROMPT" : "DRAFT", current_stage: ready ? "final_prompt" : null,
      last_error: null, updated_at: now,
    }).eq("id", data.projectId);
    if (pErr) return { ok: false as const, error: pErr.message };
    await db.from("production_history").insert({ project_id: data.projectId, action: "Video deleted", detail: "Finished video removed — ready to regenerate." });
    const { logActivity } = await import("./jobs/jobs.server");
    await logActivity({ userId: context.userId, category: "production", level: "info", projectId: data.projectId, event: "Video deleted", detail: project.title });
    return { ok: true as const };
  });
/** Review gate: REJECT. Cancels every queued post for the project so nothing is
 *  ever uploaded. Already-published posts are never touched. */
export const rejectProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: project } = await db.from("projects").select("id, user_id").eq("id", data.projectId).single();
    if (!project || project.user_id !== context.userId) return { ok: false as const, error: "Project not found." };
    const { data: cancelled } = await db.from("scheduled_posts").update({ status: "CANCELLED", status_detail: "Rejected by the owner — never published.", updated_at: new Date().toISOString() })
      .eq("project_id", data.projectId).is("external_post_id", null)
      .in("status", ["DRAFT", "READY", "SCHEDULED", "RETRYING", "FAILED"]).select("id");
    await db.from("production_history").insert({ project_id: data.projectId, action: "Rejected — will not be published", detail: `${cancelled?.length ?? 0} queued post(s) cancelled.` });
    const { logActivity } = await import("./jobs/jobs.server");
    await logActivity({ userId: context.userId, category: "publishing", level: "warning", projectId: data.projectId, event: "Video rejected — will not be published", detail: `${cancelled?.length ?? 0} queued post(s) cancelled.` });
    return { ok: true as const, cancelled: cancelled?.length ?? 0 };
  });
