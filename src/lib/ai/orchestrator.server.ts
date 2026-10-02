import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { STAGES, type ProjectStatus } from "../pipeline";
import { ProviderNotConfiguredError, type TextGenerationProvider } from "./types";
import { getTextProvider, getVideoAnalysisProvider, getVideoEditingProvider, getVideoGenerationProvider } from "./registry.server";

type Db = SupabaseClient<Database>;
type Project = Database["public"]["Tables"]["projects"]["Row"];

const SYSTEM_INSTRUCTIONS = `You are the production engine of a professional AI 3D cartoon video studio.
Rules: follow the ACTIVE SKILL exactly — it overrides general habits. Stay consistent with every earlier production output.
Locked character and world designs must never change. Never invent requirements that contradict the project settings. Respond in clean Markdown.`;

const MAX_QA_ROUNDS = 3;
const QA_LOG_MARKER = "\n\n---\n# QA LOG";

const STAGE_TASKS: Record<string, string> = {
  meta_prompt: `Write the complete MASTER META PROMPT. Use exactly these sections as level-2 headings, in this order:
Objective, Duration, Format, Story, Character Bible, World Bible, Visual Style, Action Logic, Comedy Logic, Camera Logic, Dialogue, Audio, Music, Continuity, Negative Constraints, Final Frame, Production Requirements.
The story must move clearly through SETUP → ACTION → COMPLICATION → PAYOFF → FINAL FRAME.`,
  analysis_check: `Analyze the META PROMPT below end-to-end as a strict production QA reviewer. Check each item and mark it OK or PROBLEM with a one-line reason:
Story logic, Character consistency, Environment continuity, Prop continuity, Action continuity, Camera continuity, Timing, Dialogue, Lip-sync, SFX, Music, Lighting, Colors, Animation feasibility, Video-model renderability, Comedy setup, Comedy payoff, Final-frame clarity, Generation risks.
End with exactly one line: "VERDICT: PASS" if there are no problems, otherwise "VERDICT: FAIL".`,
  analysis_fix: `Rewrite the META PROMPT so that every PROBLEM listed in the QA REVIEW is fixed. Keep the same section headings and everything that was already OK. Output only the full corrected meta prompt.`,
  characters: `Create the LOCKED CHARACTER SPECIFICATION for every character. For each character use these fields:
Species, Body, Proportions, Height, Face, Eyes, Nose, Mouth, Ears, Fur, Fur pattern, Clothing, Accessories, Colors (with hex codes), Signature features, Expressions, Personality, Movement style.
Then add a "Visual reference prompt" (one dense paragraph to render a neutral-pose 3D reference image of the character on a plain background) and a "Consistency lock" list of details that must never change in any shot.`,
  world: `Create the LOCKED WORLD & STYLE GUIDE with these sections:
Environment, Location, Background, Props (with exact positions and states), Lighting, Weather, Atmosphere, Materials, Color palette (hex codes), Cinematic style, Camera style, Depth of field, Animation style.
Finish with a "World lock" list of details that must stay identical in every shot.`,
  storyboard: `Create the PER-SECOND STORYBOARD. Write one block for EVERY second from SECOND 00 to the final second — no gaps, no ranges.
Each block starts with a heading "SECOND NN" (two digits) and has these fields:
Beat (SETUP / ACTION / COMPLICATION / PAYOFF / FINAL FRAME), Visual, Character action, Expression, Camera, Environment, Prop movement, Dialogue, SFX, Music, Continuity.
Nothing may change without a visible cause. Respect the locked character and world designs exactly.`,
  final_prompt: `Write the FINAL VIDEO GENERATION PROMPT for an external video AI model. It must faithfully implement the per-second storyboard.
Sections: Global prompt (style, characters, world — copied from the locks), Shot list (time range → exact visual/camera/action/audio), Negative prompt, Consistency notes.
Then add a "CLIPS" section that splits the video into clips of at most 8 seconds each, formatted as lines: "CLIP n | from-to | prompt".`,
  metadata: "Write social metadata for Facebook, YouTube and TikTok: title, description, short caption and 10-15 hashtags each.",
};

export async function loadActiveSkill(): Promise<{ id: string; name: string | null; version: number; content: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("skill_versions").select("id, name, version, content").eq("status", "active").maybeSingle();
  return data ?? null;
}

/** The approved meta prompt without the QA log. */
const approvedMeta = (outputs: Record<string, string>) => (outputs["analysis"] ?? outputs["meta_prompt"])?.split(QA_LOG_MARKER)[0];

/** Assembles the full layered context every production request receives. */
export function buildProductionContext(args: {
  skill: { name: string | null; version: number; content: string };
  project: Project;
  outputs: Record<string, string>;
  stageKey: string;
  task?: string | undefined;
  extra?: string | undefined;
}) {
  const { skill, project, outputs, stageKey } = args;
  const section = (title: string, body?: string | null) => `## ${title}\n${body?.trim() ? body.trim() : "(not available yet)"}`;
  const system = [
    SYSTEM_INSTRUCTIONS,
    `=== ACTIVE SKILL: ${skill.name ?? "SKILL.md"} v${skill.version} ===\n${skill.content}\n=== END SKILL ===`,
  ].join("\n\n");
  const settings = [
    `Title: ${project.title}`,
    `Topic: ${project.topic ?? "—"}`,
    `Duration: ${project.target_duration_seconds} seconds (seconds 00 to ${String(project.target_duration_seconds - 1).padStart(2, "0")})`,
    `Aspect ratio: ${project.aspect_ratio}`,
    `Target platform: ${project.target_platform ?? "—"}`,
    `Target audience: ${project.target_audience ?? "—"}`,
    `Language: ${project.language}`,
    `Visual style notes: ${project.visual_style ?? "—"}`,
  ].join("\n");
  const prompt = [
    section("PROJECT SETTINGS", settings),
    section("USER VIDEO REQUEST", project.idea),
    section("REFERENCES", project.reference_notes),
    section("META PROMPT (APPROVED)", approvedMeta(outputs)),
    section("CHARACTER REFERENCES (LOCKED)", outputs["characters"]),
    section("WORLD REFERENCES (LOCKED)", outputs["world"]),
    section("STORYBOARD", outputs["storyboard"]),
    section("VIDEO REQUIREMENTS", project.video_requirements),
    section("FINAL VIDEO PROMPT", outputs["final_prompt"]),
    section("QA REPORT", outputs["final_qa"]),
    ...(args.extra ? [args.extra] : []),
    `## CURRENT TASK\n${args.task ?? STAGE_TASKS[stageKey] ?? ""}`,
  ].join("\n\n");
  return { system, prompt };
}

/** Seconds missing from a per-second storyboard. */
export function missingSeconds(storyboard: string, duration: number): number[] {
  const found = new Set([...storyboard.matchAll(/SECOND\s+(\d{1,3})/gi)].map((m) => Number(m[1])));
  return Array.from({ length: duration }, (_, i) => i).filter((s) => !found.has(s));
}

type Ctx = { skill: { name: string | null; version: number; content: string }; project: Project; outputs: Record<string, string> };

async function runTextStage(provider: TextGenerationProvider, stageKey: string, c: Ctx): Promise<string> {
  const ask = async (task?: string, extra?: string) => {
    const { system, prompt } = buildProductionContext({ ...c, stageKey, task, extra });
    return (await provider.generate({ system, prompt })).text;
  };

  // META PROMPT → ANALYZE → FIX → ANALYZE AGAIN, until it passes QA.
  if (stageKey === "analysis") {
    let meta = c.outputs["meta_prompt"] ?? "";
    const log: string[] = [];
    for (let round = 1; round <= MAX_QA_ROUNDS; round++) {
      const review = await ask(STAGE_TASKS["analysis_check"], `## META PROMPT UNDER REVIEW\n${meta}`);
      const pass = /VERDICT:\s*PASS/i.test(review);
      log.push(`## Round ${round} — ${pass ? "PASS" : "FAIL"}\n${review}`);
      if (pass) return `${meta}${QA_LOG_MARKER}\n\n${log.join("\n\n")}`;
      if (round === MAX_QA_ROUNDS) break;
      meta = await ask(STAGE_TASKS["analysis_fix"], `## META PROMPT UNDER REVIEW\n${meta}\n\n## QA REVIEW\n${review}`);
    }
    throw new Error(`The meta prompt did not pass QA after ${MAX_QA_ROUNDS} fix rounds. Edit the idea or redo the meta prompt.`);
  }

  // Storyboard must cover every single second.
  if (stageKey === "storyboard") {
    const duration = c.project.target_duration_seconds;
    let board = await ask();
    let missing = missingSeconds(board, duration);
    if (missing.length) {
      board = await ask(undefined, `## PREVIOUS ATTEMPT WAS INCOMPLETE\nThese seconds were missing: ${missing.join(", ")}. Write the full storyboard again with every second from 00 to ${duration - 1}.`);
      missing = missingSeconds(board, duration);
    }
    if (missing.length) throw new Error(`The storyboard is missing seconds ${missing.join(", ")}. Please redo the storyboard.`);
    return board;
  }

  return ask();
}

export type StageResult = { ok: true } | { ok: false; error: string; blocked?: boolean };

export async function runStage(db: Db, userId: string, projectId: string, stageKey: string): Promise<StageResult> {
  const idx = STAGES.findIndex((s) => s.key === stageKey);
  if (idx === -1) return { ok: false, error: "Unknown stage." };
  const stage = STAGES[idx]!;

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
      output = await runTextStage(provider, stageKey, { skill, project, outputs: Object.fromEntries(doneMap) });
      model = provider.name;
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

/** Suggests video ideas from the active skill when the user has none. */
export async function suggestIdeas(input: { topic?: string | undefined; platform?: string | undefined; audience?: string | undefined; duration: number; language: string }) {
  const skill = await loadActiveSkill();
  if (!skill) throw new Error("No active skill. Upload and activate a SKILL.md in Skill Manager first.");
  const provider = getTextProvider();
  if (!provider) throw new ProviderNotConfiguredError("text");
  const system = `${SYSTEM_INSTRUCTIONS}\n\n=== ACTIVE SKILL: ${skill.name ?? "SKILL.md"} v${skill.version} ===\n${skill.content}\n=== END SKILL ===`;
  const prompt = `Suggest 5 short 3D cartoon video ideas that follow the active skill.
Topic: ${input.topic || "any"} | Platform: ${input.platform || "any"} | Audience: ${input.audience || "general"} | Duration: ${input.duration}s | Language: ${input.language}
Output exactly 5 lines, no numbering, no extra text, each formatted as: Title :: one or two sentence idea with setup, complication and payoff.`;
  const { text } = await provider.generate({ system, prompt });
  return text.split("\n").map((l) => l.replace(/^[\s\-*\d.)]+/, "").trim()).filter((l) => l.includes("::")).slice(0, 5)
    .map((l) => { const [title, ...rest] = l.split("::"); return { title: title!.trim().replace(/\*+/g, ""), idea: rest.join("::").trim() }; });
}
