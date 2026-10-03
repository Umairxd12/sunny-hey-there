import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BOARD_COLUMNS, STAGES, boardColumnFor, nextRunnableIndex } from "./pipeline";
import { PLATFORMS } from "./social/types";

/** Everything the command center needs in one round trip. Only real stored data — never placeholders. */
export const getCommandCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const [profile, projects, steps, posts, accounts, settings, failedJobs, activity, published] = await Promise.all([
      sb.from("profiles").select("display_name").eq("id", context.userId).maybeSingle(),
      sb.from("projects").select("id, title, status, current_stage, last_error, updated_at").order("updated_at", { ascending: false }).limit(200),
      sb.from("pipeline_steps").select("project_id, step_key, status"),
      sb.from("scheduled_posts").select("id, project_id, platform, title, status, scheduled_for, next_attempt_at, attempts, max_attempts, last_error, published_at, social_account_id").order("scheduled_for", { ascending: true, nullsFirst: false }).limit(500),
      sb.from("social_accounts").select("id, platform, account_name, avatar_url, status, token_status, token_expires_at, last_sync_at, last_error").order("created_at"),
      sb.from("automation_settings").select("emergency_stop, timezone").eq("user_id", context.userId).maybeSingle(),
      sb.from("automation_jobs").select("id, kind, label, status, error, started_at, completed_at, retry_count, project_id, post_id").in("status", ["failed", "blocked"]).gte("started_at", weekAgo).order("started_at", { ascending: false }).limit(8),
      sb.from("activity_log").select("id, category, level, event, detail, created_at, project_id").order("created_at", { ascending: false }).limit(25),
      sb.from("scheduled_posts").select("project_id").eq("status", "PUBLISHED"),
    ]);
    for (const r of [projects, steps, posts, accounts]) if (r.error) throw new Error(r.error.message);

    const { listProviderStatus } = await import("./ai/registry.server");
    const { loadActiveSkill } = await import("./ai/orchestrator.server");
    const { isConfigured } = await import("./social/oauth.server");
    const skill = await loadActiveSkill();
    const providers = listProviderStatus();
    const videoReady = providers.find((p) => p.capability === "video_generation")?.configured ?? false;

    const doneBy = new Map<string, Set<string>>();
    for (const s of steps.data ?? []) if (s.status === "done") (doneBy.get(s.project_id) ?? doneBy.set(s.project_id, new Set()).get(s.project_id)!).add(s.step_key);
    const publishedProjects = new Set((published.data ?? []).map((p) => p.project_id));

    const board = (projects.data ?? []).map((p) => {
      const done = doneBy.get(p.id) ?? new Set<string>();
      return { ...p, column: boardColumnFor(p.status, p.current_stage, publishedProjects.has(p.id)), done: done.size, total: STAGES.length,
        nextStage: STAGES[nextRunnableIndex((k) => done.has(k))]?.label ?? null };
    });

    const allPosts = posts.data ?? [];
    const now = Date.now();
    const upcoming = allPosts.filter((p) => ["SCHEDULED", "RETRYING", "READY"].includes(p.status) && (!p.scheduled_for || new Date(p.scheduled_for).getTime() >= now - 3600_000)).slice(0, 6);
    const nextPost = allPosts.filter((p) => p.status === "SCHEDULED" && p.next_attempt_at).sort((a, b) => a.next_attempt_at!.localeCompare(b.next_attempt_at!))[0] ?? null;
    const retryQueue = allPosts.filter((p) => p.status === "RETRYING");

    // The next video generation is the first project whose only remaining step before video is done.
    const genIdx = STAGES.findIndex((s) => s.key === "generate_video");
    const waitingForVideo = board.filter((p) => nextRunnableIndex((k) => (doneBy.get(p.id) ?? new Set()).has(k)) === genIdx);

    const failedPosts = allPosts.filter((p) => p.status === "FAILED").slice(0, 8);
    return {
      name: profile.data?.display_name ?? (context.claims as { email?: string }).email?.split("@")[0] ?? null,
      status: {
        skill: skill ? { name: skill.name, version: skill.version } : null,
        textAi: providers.find((p) => p.capability === "text")?.configured ?? false,
        videoAi: videoReady,
        platformsReady: PLATFORMS.filter((p) => isConfigured(p)),
        emergencyStop: settings.data?.emergency_stop ?? false,
        timezone: settings.data?.timezone ?? null,
      },
      cards: {
        inProduction: board.filter((p) => !["DRAFT", "COMPLETED", "FAILED"].includes(p.status)).length,
        ready: allPosts.filter((p) => p.status === "READY").length,
        scheduled: allPosts.filter((p) => p.status === "SCHEDULED" || p.status === "RETRYING").length,
        publishedToday: allPosts.filter((p) => p.status === "PUBLISHED" && p.published_at && new Date(p.published_at) >= startOfDay).length,
      },
      columns: BOARD_COLUMNS,
      board,
      upcoming,
      accounts: (accounts.data ?? []).filter((a) => a.status !== "disconnected"),
      automation: {
        nextPost,
        nextVideo: waitingForVideo[0] ? { id: waitingForVideo[0].id, title: waitingForVideo[0].title, waiting: waitingForVideo.length } : null,
        videoReady,
        failedJobs: failedJobs.data ?? [],
        failedPosts,
        retryQueue,
      },
      activity: activity.data ?? [],
    };
  });

export const listJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ status: z.enum(["all", "running", "succeeded", "failed", "blocked", "retrying", "skipped"]).default("all") }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("automation_jobs").select("*").eq("user_id", context.userId).order("started_at", { ascending: false }).limit(100);
    if (data.status !== "all") q = q.eq("status", data.status);
    const [jobs, activity] = await Promise.all([
      q,
      context.supabase.from("activity_log").select("*").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(200),
    ]);
    if (jobs.error) throw new Error(jobs.error.message);
    return { jobs: jobs.data ?? [], activity: activity.data ?? [] };
  });
