import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const pid = z.object({ projectId: z.string().uuid() });

async function loadCtx(db: any, projectId: string) {
  const [{ data: project }, { data: steps }] = await Promise.all([
    db.from("projects").select("*").eq("id", projectId).single(),
    db.from("pipeline_steps").select("step_key, output, status").eq("project_id", projectId),
  ]);
  const outputs: Record<string, string> = {};
  for (const s of steps ?? []) if (s.status === "done" && s.output) outputs[s.step_key] = s.output;
  return { project, outputs };
}

/** AI editing recommendations based on the storyboard and the latest review. */
export const getEditingRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => pid.parse(d))
  .handler(async ({ data, context }) => {
    const { loadActiveSkill, buildProductionContext } = await import("./ai/orchestrator.server");
    const { getTextProvider } = await import("./ai/registry.server");
    const skill = await loadActiveSkill();
    if (!skill) return { ok: false as const, error: "Activate a skill in Skill Manager first." };
    const provider = getTextProvider();
    if (!provider) return { ok: false as const, error: "No text AI provider is connected." };
    const { project, outputs } = await loadCtx(context.supabase, data.projectId);
    if (!project) return { ok: false as const, error: "Project not found." };
    if (!outputs["storyboard"]) return { ok: false as const, error: "Finish the storyboard stage first." };
    const [{ data: clips }, { data: review }] = await Promise.all([
      context.supabase.from("video_clips").select("position, from_s, to_s, status, is_deleted").eq("project_id", data.projectId).order("position"),
      context.supabase.from("video_reviews").select("report, failed_segments").eq("project_id", data.projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const extra = `## CURRENT CLIPS\n${(clips ?? []).map((c) => `Clip ${c.position + 1}: ${c.from_s}-${c.to_s}s ${c.status}${c.is_deleted ? " (deleted)" : ""}`).join("\n") || "(no clips yet)"}\n\n## LATEST VIDEO REVIEW\n${review?.report ?? "(no review yet)"}`;
    const task = `Give concrete EDITING RECOMMENDATIONS that bring the video in line with the per-second storyboard. One bullet per recommendation: "[mm:ss-mm:ss] Action (trim / split / delete / reorder / replace / regenerate / SFX / music / volume / timing / transition) — reason". Max 12 bullets, most important first.`;
    const { system, prompt } = buildProductionContext({ skill, project, outputs, stageKey: "editing", task, extra });
    try {
      const res = await provider.generate({ system, prompt });
      await context.supabase.from("production_history").insert({ project_id: data.projectId, user_id: context.userId, action: "AI editing recommendations", detail: res.model });
      return { ok: true as const, text: res.text };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Could not create recommendations." };
    }
  });

/** Regenerates one clip through the connected video provider. */
export const regenerateClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid(), clipId: z.string().uuid(), fix: z.string().max(2000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { getVideoGenerationProvider } = await import("./ai/registry.server");
    const provider = getVideoGenerationProvider();
    if (!provider) return { ok: false as const, blocked: true, error: "No video generation provider is connected. Connect one in AI Providers to regenerate this part." };
    const { data: clip } = await context.supabase.from("video_clips").select("*").eq("id", data.clipId).single();
    const { data: project } = await context.supabase.from("projects").select("aspect_ratio").eq("id", data.projectId).single();
    if (!clip || !project) return { ok: false as const, error: "Clip not found." };
    try {
      const prompt = [clip.prompt ?? "", data.fix ? `FIX: ${data.fix}` : ""].filter(Boolean).join("\n");
      const { jobIds } = await provider.submit({ mode: "text_to_video", prompt, durationSeconds: Number(clip.to_s) - Number(clip.from_s), aspectRatio: project.aspect_ratio });
      await context.supabase.from("video_clips").update({ status: "regenerating", provider_job_id: jobIds[0] ?? null }).eq("id", clip.id);
      await context.supabase.from("production_history").insert({ project_id: data.projectId, user_id: context.userId, action: `Regenerate clip ${clip.position + 1}`, detail: data.fix ?? null });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Regeneration failed." };
    }
  });

/** Renders the final master MP4 from the edit list through the connected editing provider. */
export const renderMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => pid.parse(d))
  .handler(async ({ data, context }) => {
    const { getVideoEditingProvider } = await import("./ai/registry.server");
    const provider = getVideoEditingProvider();
    if (!provider) return { ok: false as const, blocked: true, error: "No video editing provider is connected. Connect one in AI Providers to render the final MP4." };
    const { data: clips } = await context.supabase.from("video_clips").select("video_url").eq("project_id", data.projectId).eq("is_deleted", false).order("position");
    const urls = (clips ?? []).map((c) => c.video_url).filter((u): u is string => !!u);
    if (!urls.length) return { ok: false as const, error: "There are no clips to assemble." };
    try {
      const { jobId } = await provider.assemble({ clipUrls: urls });
      await context.supabase.from("video_assets").insert({ project_id: data.projectId, user_id: context.userId, kind: "final_pending", metadata: { jobId } });
      await context.supabase.from("production_history").insert({ project_id: data.projectId, user_id: context.userId, action: "Render final master MP4", detail: jobId });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Render failed." };
    }
  });
