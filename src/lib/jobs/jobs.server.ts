import type { Json } from "@/integrations/supabase/types";

/**
 * Job + activity recorder. Every automation job gets an id, status, start/finish time, error,
 * retry count, provider response and result. Writes use the service role so users can't forge logs.
 * Recording never throws — a logging problem must not break the real work.
 */
async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export type JobKind = "pipeline_stage" | "publish" | "publish_status" | "analytics_sync" | "account" | "clip_regenerate" | "render_master";
export type ActivityCategory = "production" | "publishing" | "analytics" | "account" | "security" | "settings";
export type ActivityLevel = "info" | "success" | "warning" | "error";

const toJson = (v: unknown): Json | null => {
  if (v == null) return null;
  try { return JSON.parse(JSON.stringify(v).slice(0, 20_000)) as Json; } catch { return { text: String(v).slice(0, 2000) }; }
};

export async function startJob(input: { userId: string; kind: JobKind; label: string; projectId?: string | null; postId?: string | null; provider?: string | null; retryCount?: number }) {
  try {
    const db = await admin();
    const { data } = await db.from("automation_jobs").insert({
      user_id: input.userId, kind: input.kind, label: input.label, project_id: input.projectId ?? null,
      post_id: input.postId ?? null, provider: input.provider ?? null, retry_count: input.retryCount ?? 0, status: "running",
    }).select("id").single();
    return data?.id ?? null;
  } catch (e) {
    console.error("startJob failed", e);
    return null;
  }
}

export async function finishJob(jobId: string | null, out: { status: "succeeded" | "failed" | "blocked" | "retrying" | "skipped"; error?: string | null; result?: unknown; providerResponse?: unknown; provider?: string | null; retryCount?: number }) {
  if (!jobId) return;
  try {
    const db = await admin();
    await db.from("automation_jobs").update({
      status: out.status, completed_at: new Date().toISOString(), error: out.error?.slice(0, 2000) ?? null,
      result: toJson(out.result), provider_response: toJson(out.providerResponse),
      ...(out.provider !== undefined ? { provider: out.provider } : {}),
      ...(out.retryCount !== undefined ? { retry_count: out.retryCount } : {}),
    }).eq("id", jobId);
  } catch (e) {
    console.error("finishJob failed", e);
  }
}

export async function logActivity(input: { userId: string; category: ActivityCategory; event: string; detail?: string | null; level?: ActivityLevel; projectId?: string | null; jobId?: string | null }) {
  try {
    const db = await admin();
    await db.from("activity_log").insert({
      user_id: input.userId, category: input.category, event: input.event.slice(0, 200), detail: input.detail?.slice(0, 1000) ?? null,
      level: input.level ?? "info", project_id: input.projectId ?? null, job_id: input.jobId ?? null,
    });
  } catch (e) {
    console.error("logActivity failed", e);
  }
}
