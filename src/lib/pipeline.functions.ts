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
    scholar: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { suggestIdeas } = await import("./ai/orchestrator.server");
    try {
      return { ok: true as const, ideas: await suggestIdeas(data, context.userId, data.scholar ?? false) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Could not suggest ideas." };
    }
  });

export const generateVideoBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    duration: z.number().int().min(3).max(180),
    language: z.string().max(40),
    scholar: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { generateBrief } = await import("./ai/orchestrator.server");
    try {
      return { ok: true as const, brief: await generateBrief(data, context.userId, data.scholar ?? false) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Could not generate a brief." };
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
 * Hands the ENTIRE production to the studio agent (TechGenie's API): script,
 * storyboard, characters, video — everything. The agent runs the active skill
 * end-to-end and reports every stage back through /api/public/hooks/video-jobs.
 * The website becomes the review + approve/reject + auto-publish front-end.
 */
export const delegateFullPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: project } = await db.from("projects").select("id, user_id, title, status").eq("id", data.projectId).single();
    if (!project || project.user_id !== context.userId) return { ok: false as const, error: "Project not found." };
    if (project.status === "COMPLETED") return { ok: false as const, error: "This video is already finished." };

    const { data: existing } = await db.from("pipeline_steps").select("status").eq("project_id", data.projectId).eq("step_key", "full_pipeline").maybeSingle();
    if (existing && ["queued", "running"].includes(existing.status)) {
      return { ok: false as const, error: "TechGenie is already making this video." };
    }

    const now = new Date().toISOString();
    const { error } = await db.from("pipeline_steps").upsert(
      { project_id: data.projectId, user_id: context.userId, step_key: "full_pipeline", status: "queued",
        error: "Queued for TechGenie. Script, storyboard, characters and video are being made now — you can close this page.",
        started_at: now, finished_at: null },
      { onConflict: "project_id,step_key" },
    );
    if (error) return { ok: false as const, error: error.message };
    await db.from("projects").update({ status: "GENERATING", current_stage: "generate_video", last_error: null, updated_at: now }).eq("id", data.projectId);
    await db.from("production_history").insert({ project_id: data.projectId, action: "Full production delegated to TechGenie", detail: "Script, storyboard, characters and video — all made by the studio agent." });
    const { logActivity } = await import("./jobs/jobs.server");
    await logActivity({ userId: context.userId, category: "production", level: "info", projectId: data.projectId, event: "Video production started", detail: `${project.title} — TechGenie is making it.` });
    return { ok: true as const };
  });

/**
 * Permanently deletes a project. All project FKs are ON DELETE CASCADE, so
 * pipeline_steps, clips, assets, videos, posts, etc. are cleared with it.
 */
export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: project } = await db.from("projects").select("id, user_id, title").eq("id", data.projectId).single();
    if (!project || project.user_id !== context.userId) return { ok: false as const, error: "Project not found." };
    const { error } = await db.from("projects").delete().eq("id", data.projectId);
    if (error) return { ok: false as const, error: error.message };
    const { logActivity } = await import("./jobs/jobs.server");
    await logActivity({ userId: context.userId, category: "production", level: "warning", event: "Project deleted", detail: project.title });
    return { ok: true as const };
  });

/**
 * Resets a project back to DRAFT: clears every pipeline step, clip, asset,
 * review and unsent post so the whole flow can run again cleanly.
 * Title, idea and settings are kept.
 */
export const resetProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: project } = await db.from("projects").select("id, user_id, title").eq("id", data.projectId).single();
    if (!project || project.user_id !== context.userId) return { ok: false as const, error: "Project not found." };
    const RESET_TABLES = ["pipeline_steps", "characters", "storyboards", "videos", "video_clips", "video_assets", "video_audio_tracks", "video_reviews", "production_history", "automation_jobs"] as const;
    for (const table of RESET_TABLES) {
      const { error } = await db.from(table).delete().eq("project_id", data.projectId);
      if (error) return { ok: false as const, error: error.message };
    }
    const { error: postErr } = await db.from("scheduled_posts").delete().eq("project_id", data.projectId).is("external_post_id", null);
    if (postErr) return { ok: false as const, error: postErr.message };
    const { error: pErr } = await db.from("projects")
      .update({ status: "DRAFT", current_stage: null, last_error: null, updated_at: new Date().toISOString() })
      .eq("id", data.projectId);
    if (pErr) return { ok: false as const, error: pErr.message };
    const { logActivity } = await import("./jobs/jobs.server");
    await logActivity({ userId: context.userId, category: "production", level: "info", projectId: data.projectId, event: "Project reset", detail: `${project.title} — dobara banane ke liye tayyar.` });
    return { ok: true as const };
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
