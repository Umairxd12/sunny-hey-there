import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runPipelineStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid(), stepKey: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const { runStage } = await import("./ai/orchestrator.server");
    return runStage(context.supabase, context.userId, data.projectId, data.stepKey);
  });

export const suggestVideoIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    topic: z.string().max(200).optional(),
    platform: z.string().max(40).optional(),
    audience: z.string().max(200).optional(),
    duration: z.number().int().min(3).max(180),
    language: z.string().max(40),
  }).parse(d))
  .handler(async ({ data }) => {
    const { suggestIdeas } = await import("./ai/orchestrator.server");
    try {
      return { ok: true as const, ideas: await suggestIdeas(data) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Could not suggest ideas." };
    }
  });

export const getEngineStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listProviderStatus } = await import("./ai/registry.server");
    const { loadActiveSkill } = await import("./ai/orchestrator.server");
    const skill = await loadActiveSkill();
    return {
      providers: listProviderStatus(),
      activeSkill: skill ? { name: skill.name, version: skill.version } : null,
    };
  });

/**
 * Hands the generate_video stage to the external video worker (the studio's own
 * render pipeline) when no video generation provider is connected. The worker
 * picks the job up from /api/public/hooks/video-jobs and reports back there.
 */
export const delegateVideoToWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: project } = await db.from("projects").select("id, user_id, title, status").eq("id", data.projectId).single();
    if (!project || project.user_id !== context.userId) return { ok: false as const, error: "Project not found." };

    const { data: steps } = await db.from("pipeline_steps").select("step_key, status").eq("project_id", data.projectId);
    const done = (k: string) => steps?.some((s) => s.step_key === k && s.status === "done");
    if (!done("final_prompt")) return { ok: false as const, error: "The final video prompt stage must finish first." };
    if (done("generate_video")) return { ok: false as const, error: "The video stage is already done." };

    const { getVideoGenerationProvider } = await import("./ai/registry.server");
    if (getVideoGenerationProvider()) {
      return { ok: false as const, error: "A video provider is connected — run the Video generation stage directly instead." };
    }

    const now = new Date().toISOString();
    const { error } = await db.from("pipeline_steps").upsert(
      { project_id: data.projectId, user_id: context.userId, step_key: "generate_video", status: "queued",
        error: "Queued for the video worker. Your video is being generated and will appear in Videos when it is ready.",
        started_at: now, finished_at: null },
      { onConflict: "project_id,step_key" },
    );
    if (error) return { ok: false as const, error: error.message };
    await db.from("projects").update({ status: "GENERATING", current_stage: "generate_video", last_error: null, updated_at: now }).eq("id", data.projectId);
    await db.from("production_history").insert({ project_id: data.projectId, action: "Video queued for the worker", detail: "generate_video delegated to the external video worker." });
    const { logActivity } = await import("./jobs/jobs.server");
    await logActivity({ userId: context.userId, category: "production", level: "info", projectId: data.projectId, event: "Video queued for the worker", detail: project.title });
    return { ok: true as const };
  });
