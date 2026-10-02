import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { STAGES, type ProjectStatus } from "../pipeline";
import { ProviderNotConfiguredError } from "./types";
import { getTextProvider, getVideoAnalysisProvider, getVideoEditingProvider, getVideoGenerationProvider } from "./registry.server";

type Db = SupabaseClient<Database>;
type Project = Database["public"]["Tables"]["projects"]["Row"];

const SYSTEM_INSTRUCTIONS = `You are the production engine of a professional AI 3D cartoon video studio.
Rules: follow the ACTIVE SKILL exactly — it overrides general habits. Stay consistent with every earlier production output.
Never invent requirements that contradict the project settings. Respond in clean Markdown.`;

const STAGE_TASKS: Record<string, string> = {
  meta_prompt: "Write the MASTER META PROMPT: goal, audience, story arc, tone, characters needed, setting, duration, aspect ratio and every production constraint from the skill.",
  analysis: "Analyze the master meta prompt end-to-end. List strengths, gaps, contradictions and risks, then output a corrected FINAL BRIEF.",
  characters: "Create the full character design sheet for every character: name, role, body shape, face, hair, outfit, colors, personality, expressions, voice and 3D consistency rules.",
  world: "Create the world and visual style guide: locations, time of day, lighting, color palette, materials, camera language, render style and mood.",
  storyboard: "Create a PER-SECOND storyboard covering every second. For each second: time, shot type, camera move, characters, action, expression, background, sound/voice.",
  final_prompt: "Write the FINAL VIDEO GENERATION PROMPT for a video AI model. It must faithfully encode characters, world style and the per-second storyboard.",
  metadata: "Write social metadata for Facebook, YouTube and TikTok: title, description, short caption and 10-15 hashtags each.",
};

export async function loadActiveSkill(): Promise<{ id: string; name: string | null; version: number; content: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("skill_versions").select("id, name, version, content").eq("status", "active").maybeSingle();
  return data ?? null;
}

/** Assembles the full layered context every production request receives. */
export function buildProductionContext(args: {
  skill: { name: string | null; version: number; content: string };
  project: Project;
  outputs: Record<string, string>;
  stageKey: string;
}) {
  const { skill, project, outputs, stageKey } = args;
  const section = (title: string, body?: string | null) => `## ${title}\n${body?.trim() ? body.trim() : "(not available yet)"}`;
  const system = [
    SYSTEM_INSTRUCTIONS,
    `=== ACTIVE SKILL: ${skill.name ?? "SKILL.md"} v${skill.version} ===\n${skill.content}\n=== END SKILL ===`,
  ].join("\n\n");
  const prompt = [
    section("PROJECT SETTINGS", `Title: ${project.title}\nDuration: ${project.target_duration_seconds} seconds\nAspect ratio: ${project.aspect_ratio}\nLanguage: ${project.language}\nVisual style notes: ${project.visual_style ?? "—"}`),
    section("USER VIDEO REQUEST", project.idea),
    section("META PROMPT (ANALYZED)", outputs["analysis"] ?? outputs["meta_prompt"]),
    section("CHARACTER REFERENCES", outputs["characters"]),
    section("WORLD REFERENCES", outputs["world"]),
    section("STORYBOARD", outputs["storyboard"]),
    section("VIDEO REQUIREMENTS", project.video_requirements),
    section("FINAL VIDEO PROMPT", outputs["final_prompt"]),
    section("QA REPORT", outputs["final_qa"]),
    `## CURRENT TASK\n${STAGE_TASKS[stageKey] ?? ""}`,
  ].join("\n\n");
  return { system, prompt };
}

export type StageResult = { ok: true } | { ok: false; error: string; blocked?: boolean };

export async function runStage(db: Db, userId: string, projectId: string, stageKey: string): Promise<StageResult> {
  const idx = STAGES.findIndex((s) => s.key === stageKey);
  if (idx === -1) return { ok: false, error: "Unknown stage." };
  const stage = STAGES[idx];

  const { data: project } = await db.from("projects").select("*").eq("id", projectId).single();
  if (!project) return { ok: false, error: "Project not found." };

  const { data: steps } = await db.from("pipeline_steps").select("step_key, status, output").eq("project_id", projectId);
  const doneMap = new Map((steps ?? []).filter((s) => s.status === "done").map((s) => [s.step_key, s.output ?? ""]));

  // State machine: every earlier stage must be done. No silent skipping.
  const missing = STAGES.slice(0, idx).find((s) => !doneMap.has(s.key));
  if (missing) return { ok: false, error: `"${missing.label}" must finish before "${stage.label}".` };

  const skill = await loadActiveSkill();
  if (!skill) return { ok: false, error: "No active skill. Upload and activate a SKILL.md in Skill Manager first." };

  const isRedo = doneMap.has(stageKey);
  const runningStatus: ProjectStatus = stageKey === "generate_video" && doneMap.has("editing") ? "REGENERATING" : stage.status === "COMPLETED" ? "FINAL_QA" : stage.status;
  const now = () => new Date().toISOString();

  await db.from("pipeline_steps").upsert(
    { project_id: projectId, user_id: userId, step_key: stageKey, status: "running", error: null, started_at: now(), finished_at: null },
    { onConflict: "project_id,step_key" },
  );
  // Redoing a stage invalidates everything after it, so later stages can't drift from earlier ones.
  if (isRedo) {
    const later = STAGES.slice(idx + 1).map((s) => s.key);
    if (later.length) await db.from("pipeline_steps").update({ status: "pending", error: null }).eq("project_id", projectId).in("step_key", later);
  }
  await db.from("projects").update({ status: runningStatus, current_stage: stageKey, last_error: null, skill_version_id: skill.id }).eq("id", projectId);

  const fail = async (message: string, blocked = false): Promise<StageResult> => {
    await db.from("pipeline_steps").update({ status: blocked ? "blocked" : "failed", error: message, finished_at: now() }).eq("project_id", projectId).eq("step_key", stageKey);
    await db.from("projects").update({ status: blocked ? runningStatus : "FAILED", last_error: message }).eq("id", projectId);
    return { ok: false, error: message, blocked };
  };

  try {
    let output: string;
    let model: string | null = null;
    if (stage.capability === "text") {
      const provider = getTextProvider();
      if (!provider) throw new ProviderNotConfiguredError("text");
      const outputs = Object.fromEntries(doneMap);
      const { system, prompt } = buildProductionContext({ skill, project, outputs, stageKey });
      const r = await provider.generate({ system, prompt });
      output = r.text;
      model = `${provider.name} · ${r.model}`;
    } else {
      const provider =
        stage.capability === "video_generation" ? getVideoGenerationProvider()
        : stage.capability === "video_editing" ? getVideoEditingProvider()
        : getVideoAnalysisProvider();
      if (!provider) throw new ProviderNotConfiguredError(stage.capability);
      // Adapters are wired here when a provider is registered.
      throw new Error(`${provider.name} is registered but its ${stage.label} flow is not implemented yet.`);
    }

    await db.from("pipeline_steps").update({ status: "done", output, model, finished_at: now() }).eq("project_id", projectId).eq("step_key", stageKey);
    if (stageKey === "storyboard") await db.from("storyboards").insert({ project_id: projectId, user_id: userId, content: output });
    if (stageKey === "characters") await db.from("characters").insert({ project_id: projectId, user_id: userId, name: `${project.title} cast`, description: output });
    const isLast = idx === STAGES.length - 1;
    await db.from("projects").update({ status: isLast ? "COMPLETED" : runningStatus }).eq("id", projectId);
    return { ok: true };
  } catch (e) {
    console.error("stage failed", stageKey, e);
    if (e instanceof ProviderNotConfiguredError) return fail(e.message, true);
    return fail(e instanceof Error ? e.message : "Something went wrong.");
  }
}
