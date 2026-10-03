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
