import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { STAGES, STAGE_DONE_EVENT, type ProjectStatus } from "../pipeline";
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
The story must move clearly through SETUP → ACTION → COMPLICATION → PAYOFF → FINAL FRAME.
ONE-INVENTION RULE (non-negotiable): the entire video revolves around ONE single invention/contraption, ONE problem and ONE deadpan payoff. Never write a compilation of several gags or "N tiny problems". The story plays as ONE continuous scene — the same place, same light, same contraption from the first second to the last; only the camera moves.`,
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
CONTINUITY RULE: this is ONE continuous film, not separate sketches. Every SECOND block after the first must continue the previous second's end state — same characters, same ONE contraption, same background, same light. State the handoff explicitly in the Visual field ("CONTINUING: ..."). The camera may move (wide → medium → close-up); the world must not. Nothing may change without a visible cause. Respect the locked character and world designs exactly.`,
  final_prompt: `Write the FINAL VIDEO GENERATION PROMPT for an external video AI model. It must faithfully implement the per-second storyboard.
Sections: Global prompt (style, characters, world — copied from the locks), Shot list (time range → exact visual/camera/action/audio), Negative prompt, Consistency notes.
Then add a "CLIPS" section that splits the video into clips of at most 8 seconds each, formatted as lines: "CLIP n | from-to | prompt".
CLIP CONTINUITY: each clip prompt must open with "CONTINUING from the previous clip's end frame: ..." so the clips stitch into one continuous film. Describe the video's ONE contraption with IDENTICAL words in every clip.`,
  metadata: "Write social metadata for Facebook, YouTube and TikTok: title, description, short caption and 10-15 hashtags each.",
};

export async function loadActiveSkill(): Promise<{ id: string; name: string | null; version: number; content: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("skill_versions").select("id, name, version, content").eq("status", "active").maybeSingle();
  return data ?? null;
}

/**
 * Which skill drives a project. 2D Studio projects (visual_style mentions 2D)
 * use the owner's bundled 2D Minimalist Scholar master prompt; everything else
 * uses the active Skill Manager skill (the 3D cartoon pipeline).
 */
export async function loadSkillForProject(project: { visual_style?: string | null }) {
  if (/2d/i.test(project.visual_style ?? "")) return loadScholarSkill();
  return loadActiveSkill();
}

/** The owner's bundled 2D Minimalist Scholar master prompt (2D Studio). */
export async function loadScholarSkill() {
  const { SCHOLAR_SKILL } = await import("../scholar-skill");
  return { id: "bundled-scholar", name: SCHOLAR_SKILL.name, version: SCHOLAR_SKILL.version, content: SCHOLAR_SKILL.content };
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
  const is2D = /2d/i.test(project.visual_style ?? "");
  const styleOverride = is2D
    ? `=== STYLE OVERRIDE: 2D CARTOON (user selected 2D Studio) ===\nThis video is rendered as a flat 2D cartoon — NOT 3D. Wherever the skill or earlier outputs say "3D", "3D render", "stylized 3D", "Pixar-like" or "clay", substitute: flat 2D cartoon animation with bold clean outlines, flat colors, simple cel shading, playful squash-and-stretch — no 3D depth, no volumetric render look, no soft-3D fur shading. Characters, world, story, comedy, camera and continuity rules stay EXACTLY the same — only the render style changes to 2D.`
    : "";
  const system = [
    SYSTEM_INSTRUCTIONS,
    `=== ACTIVE SKILL: ${skill.name ?? "SKILL.md"} v${skill.version} ===\n${skill.content}\n=== END SKILL ===`,
    ...(styleOverride ? [styleOverride] : []),
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

  const skill = await loadSkillForProject(project);
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

  const { startJob, finishJob, logActivity } = await import("../jobs/jobs.server");
  const jobId = await startJob({ userId, kind: "pipeline_stage", label: `${stage.label} — ${project.title}`, projectId });

  const fail = async (message: string, blocked = false): Promise<StageResult> => {
    await db.from("pipeline_steps").update({ status: blocked ? "blocked" : "failed", error: message, finished_at: now() }).eq("project_id", projectId).eq("step_key", stageKey);
    await db.from("projects").update({ status: blocked ? runningStatus : "FAILED", last_error: message }).eq("id", projectId);
    await finishJob(jobId, { status: blocked ? "blocked" : "failed", error: message });
    await logActivity({ userId, category: "production", level: blocked ? "warning" : "error", projectId, jobId,
      event: blocked ? `${stage.label} waiting for a connection` : `${stage.label} failed`, detail: `${project.title}: ${message}` });
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
    await finishJob(jobId, { status: "succeeded", provider: model, result: { stage: stageKey, characters: output.length, redo: isRedo } });
    await logActivity({ userId, category: "production", level: "success", projectId, jobId, event: STAGE_DONE_EVENT[stageKey] ?? `${stage.label} done`, detail: project.title });
    if (isLast) {
      // Completed videos become READY posts (or SCHEDULED when auto-publish is on).
      const { queueCompletedProject } = await import("../automation/automation.server");
      try {
        const queued = await queueCompletedProject(db, userId, projectId);
        await logActivity({ userId, category: "publishing", level: "info", projectId, event: "Added to content calendar", detail: queued });
      } catch (e) {
        console.error("queueCompletedProject failed", e);
        await logActivity({ userId, category: "publishing", level: "error", projectId, event: "Could not add to content calendar", detail: (e as Error).message });
      }
    }
    return { ok: true };
  } catch (e) {
    console.error("stage failed", stageKey, e);
    if (e instanceof ProviderNotConfiguredError) return fail(e.message, true);
    return fail(e instanceof Error ? e.message : "Something went wrong.");
  }
}

/** Recent topics/ideas for this user — fed into idea prompts so new videos never repeat old scenes. */
async function recentConcepts(userId: string | undefined): Promise<string> {
  if (!userId) return "";
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("projects").select("title, topic, idea")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(15);
    const items = (data ?? []).map((p: any) => `- ${p.title ?? "Untitled"}${p.topic ? ` (${p.topic})` : ""}${p.idea ? `: ${String(p.idea).slice(0, 160)}` : ""}`);
    if (!items.length) return "";
    return `\nALREADY-MADE VIDEOS (never repeat these inventions, scenes or punchlines — invent something clearly different):\n${items.join("\n")}`;
  } catch {
    return "";
  }
}
/** Suggests video ideas from the active skill when the user has none. */
export async function suggestIdeas(input: { topic?: string | undefined; platform?: string | undefined; audience?: string | undefined; duration: number; language: string }, userId?: string, scholar = false) {
  const skill = scholar ? await loadScholarSkill() : await loadActiveSkill();
  if (!skill) throw new Error("No active skill. Upload and activate a SKILL.md in Skill Manager first.");
  const provider = getTextProvider();
  if (!provider) throw new ProviderNotConfiguredError("text");
  const system = `${SYSTEM_INSTRUCTIONS}\n\n=== ACTIVE SKILL: ${skill.name ?? "SKILL.md"} v${skill.version} ===\n${skill.content}\n=== END SKILL ===`;
  const memory = await recentConcepts(userId);
  const scholarRule = scholar
    ? `Rotate across the scholar's topic families (prehistoric survival, evolution/psychology, archaeology/inventions, apex predators, wildcards) — pick a DIFFERENT family from the already-made videos below. Each idea is a narrated educational story for flat 2D minimalist animation.`
    : `Each idea must be ONE single invention with ONE continuous scene (never a compilation of gags).`;
  const prompt = `Suggest 5 short video ideas that follow the active skill.
Topic: ${input.topic || "any"} | Platform: ${input.platform || "any"} | Audience: ${input.audience || "general"} | Duration: ${input.duration}s | Language: ${input.language}
${scholarRule}${memory}
Output exactly 5 lines, no numbering, no extra text, each formatted as: Title :: one or two sentence idea with setup, complication and payoff.`;
  const { text } = await provider.generate({ system, prompt });
  return text.split("\n").map((l) => l.replace(/^[\s\-*\d.)]+/, "").trim()).filter((l) => l.includes("::")).slice(0, 5)
    .map((l) => { const [title, ...rest] = l.split("::"); return { title: title!.trim().replace(/\*+/g, ""), idea: rest.join("::").trim() }; });
}

/**
 * One-click brief: invents a fresh topic, a catchy title and a full video
 * description from the active skill — used by the "AI se likhwao" button on
 * the Create page to fill the Title, Topic and Video idea fields at once.
 */
export async function generateBrief(input: { duration: number; language: string }, userId?: string, scholar = false) {
  const skill = scholar ? await loadScholarSkill() : await loadActiveSkill();
  if (!skill) throw new Error("No active skill. Upload and activate a SKILL.md in Skill Manager first.");
  const provider = getTextProvider();
  if (!provider) throw new ProviderNotConfiguredError("text");
  const system = `${SYSTEM_INSTRUCTIONS}\n\n=== ACTIVE SKILL: ${skill.name ?? "SKILL.md"} v${skill.version} ===\n${skill.content}\n=== END SKILL ===`;
  const memory = await recentConcepts(userId);
  const prompt = scholar
    ? `Invent ONE fresh educational 2D minimalist animation concept from the scholar's topic families (prehistoric human survival, evolutionary biology/psychology, archaeological breakthroughs & primitive inventions, apex predator behavior/animal cognition, obscure high-curiosity wildcards). Duration: ${input.duration}s. Language: ${input.language}.
HARD RULES:
- Pick a topic family DIFFERENT from the already-made videos below — the owner demands a new topic every time, never the same background/subject twice.
- The concept is a narrated story (unseen omniscient narrator) for flat 2D minimalist vector animation per the skill's visual laws.${memory}
Return ONLY valid JSON with exactly these three keys — no markdown fences, no extra text:
{"topic": "2-4 word theme, e.g. Fire Keepers", "title": "catchy video title, max 8 words", "description": "3-5 sentences: the hook question, the core science/history, and the paradigm-shifting payoff."}`
    : `Invent ONE fresh, original short 3D cartoon video concept that follows the active skill (its characters, world, comedy structure and punchline style). Duration: ${input.duration}s. Language: ${input.language}.
HARD RULES (the user rejects anything else):
- ONE single invention / contraption in the whole video. ONE problem, ONE payoff. Never a compilation of several gags or "N tiny problems".
- The concept must play as ONE continuous scene and story: setup shows the invention, the middle operates it, the end is the deadpan payoff — all in the same place, same light, no scene jumps.${memory}
Return ONLY valid JSON with exactly these three keys — no markdown fences, no extra text:
{"topic": "2-4 word theme, e.g. Coconut Chaos", "title": "catchy video title, max 8 words", "description": "3-5 sentences: the single invention, the setup, the complication and the deadpan payoff — written as ONE continuous scene the studio will produce."}`;
  const { text } = await provider.generate({ system, prompt });
  const cleaned = text.replace(/```json|```/g, "").trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("The AI reply was not valid JSON. Please try again.");
  }
  const topic = String(parsed?.topic ?? "").trim().slice(0, 200);
  const title = String(parsed?.title ?? "").trim().slice(0, 200);
  const description = String(parsed?.description ?? "").trim().slice(0, 4000);
  if (!title || !description) throw new Error("The AI reply was incomplete. Please try again.");
  return { topic, title, description };
}
