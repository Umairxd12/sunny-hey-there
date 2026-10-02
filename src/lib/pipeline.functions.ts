import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PIPELINE_STEPS, AI_STEP_KEYS } from "./pipeline";

const STEP_INSTRUCTIONS: Record<string, string> = {
  meta_prompt: "Write the MASTER META PROMPT for this 3D cartoon video: goal, audience, story arc, tone, characters needed, setting, duration, aspect ratio, and every production constraint from the skill.",
  analysis: "Analyze the master meta prompt end-to-end. List strengths, gaps, contradictions and risks, then give a corrected, final version of the brief.",
  characters: "Create the full character design sheet for every character: name, role, age, body shape, face, hair, outfit, colors, personality, expressions, voice and consistency rules for 3D animation.",
  world: "Create the world and visual style guide: locations, time of day, lighting, color palette, materials, camera language, render style and mood for a premium 3D cartoon.",
  storyboard: "Create a PER-SECOND storyboard covering every second of the video. For each second give: time, shot type, camera move, characters on screen, action, expression, background, sound/voice. Use a clear table-like list.",
  final_prompt: "Write the FINAL VIDEO GENERATION PROMPT ready to send to a video AI model. It must faithfully include characters, world style and the per-second storyboard, compressed into a precise, model-friendly prompt.",
  metadata: "Write social media metadata for Facebook, YouTube and TikTok: a title, a description, a short caption and 10-15 hashtags for each platform.",
};

async function loadActiveSkill(): Promise<{ id: string; content: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: skill } = await supabaseAdmin
    .from("skills").select("active_version_id, enabled").eq("enabled", true)
    .not("active_version_id", "is", null).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!skill?.active_version_id) return null;
  const { data: v } = await supabaseAdmin.from("skill_versions").select("id, content").eq("id", skill.active_version_id).single();
  return v ?? null;
}

export const getActiveSkillStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const s = await loadActiveSkill();
    return { active: !!s };
  });

export const runPipelineStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid(), stepKey: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!AI_STEP_KEYS.includes(data.stepKey)) return { ok: false as const, error: "This step needs an external provider that is not connected yet." };

    const { data: project, error: pErr } = await supabase.from("projects").select("*").eq("id", data.projectId).single();
    if (pErr || !project) return { ok: false as const, error: "Project not found." };

    const skill = await loadActiveSkill();
    if (!skill) return { ok: false as const, error: "No active skill. Upload and activate a SKILL.md in Skill Manager first." };

    const idx = PIPELINE_STEPS.findIndex((s) => s.key === data.stepKey);
    const prevKeys = PIPELINE_STEPS.slice(0, idx).filter((s) => s.kind === "ai_text").map((s) => s.key);
    const { data: prev } = await supabase.from("pipeline_steps").select("step_key, output, status").eq("project_id", project.id).in("step_key", prevKeys.length ? prevKeys : ["_none"]);
    const missing = prevKeys.filter((k) => !prev?.find((p) => p.step_key === k && p.status === "done"));
    if (missing.length) return { ok: false as const, error: "Finish the earlier steps first." };

    await supabase.from("pipeline_steps").upsert(
      { project_id: project.id, user_id: userId, step_key: data.stepKey, status: "running", error: null, started_at: new Date().toISOString() },
      { onConflict: "project_id,step_key" },
    );

    const system = `You are the production brain of an AI 3D cartoon video studio. Follow this SKILL file exactly; it overrides general habits.\n\n=== SKILL.md ===\n${skill.content}\n=== END SKILL ===`;
    const context_ = (prev ?? []).sort((a, b) => prevKeys.indexOf(a.step_key) - prevKeys.indexOf(b.step_key))
      .map((p) => `## ${PIPELINE_STEPS.find((s) => s.key === p.step_key)?.label}\n${p.output}`).join("\n\n");
    const prompt = `VIDEO IDEA: ${project.idea}\nTITLE: ${project.title}\nDURATION: ${project.target_duration_seconds} seconds\nASPECT RATIO: ${project.aspect_ratio}\n\n${context_ ? `PREVIOUS PRODUCTION OUTPUTS:\n${context_}\n\n` : ""}TASK: ${STEP_INSTRUCTIONS[data.stepKey]}\nRespond in clean Markdown.`;

    try {
      const { generateStepText } = await import("./ai.server");
      const { text, model } = await generateStepText(system, prompt);
      await supabase.from("pipeline_steps").update({ status: "done", output: text, model, finished_at: new Date().toISOString() })
        .eq("project_id", project.id).eq("step_key", data.stepKey);
      if (data.stepKey === "storyboard") await supabase.from("storyboards").insert({ project_id: project.id, user_id: userId, content: text });
      if (data.stepKey === "characters") await supabase.from("characters").insert({ project_id: project.id, user_id: userId, name: `${project.title} cast`, description: text });
      await supabase.from("projects").update({ status: "in_production", skill_version_id: skill.id }).eq("id", project.id);
      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      console.error("pipeline step failed", e);
      await supabase.from("pipeline_steps").update({ status: "failed", error: msg, finished_at: new Date().toISOString() })
        .eq("project_id", project.id).eq("step_key", data.stepKey);
      return { ok: false as const, error: msg };
    }
  });
