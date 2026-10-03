// Client-safe production pipeline definition + state machine.

export type ProjectStatus =
  | "DRAFT" | "META_PROMPT" | "ANALYZING" | "CHARACTER_DESIGN" | "WORLD_DESIGN" | "STORYBOARD"
  | "VIDEO_PROMPT" | "GENERATING" | "REVIEWING" | "EDITING" | "REGENERATING" | "FINAL_QA"
  | "COMPLETED" | "FAILED";

/** Which provider capability a stage needs. */
export type Capability = "text" | "video_generation" | "video_analysis" | "video_editing";

export interface StageDef {
  key: string;
  label: string;
  description: string;
  status: ProjectStatus;
  capability: Capability;
}

/** Ordered stages. Every stage must complete before the next one may run — no skipping. */
export const STAGES: StageDef[] = [
  { key: "meta_prompt", label: "Meta prompt", description: "Full brief: objective, story, character & world bible, camera, comedy, audio, continuity, final frame.", status: "META_PROMPT", capability: "text" },
  { key: "analysis", label: "Meta prompt QA", description: "Checks 19 points end-to-end, fixes problems and checks again until it passes.", status: "ANALYZING", capability: "text" },
  { key: "characters", label: "Character design", description: "Locked character sheet: body, face, fur, clothing, colors, expressions, movement.", status: "CHARACTER_DESIGN", capability: "text" },
  { key: "world", label: "World & style", description: "Locked world: location, props, lighting, palette, camera and animation style.", status: "WORLD_DESIGN", capability: "text" },
  { key: "storyboard", label: "Per-second storyboard", description: "One block for every second: setup, action, complication, payoff, final frame.", status: "STORYBOARD", capability: "text" },
  { key: "final_prompt", label: "Final video prompt", description: "The exact prompt and clip list sent to the video provider, built from the storyboard.", status: "VIDEO_PROMPT", capability: "text" },
  { key: "generate_video", label: "Video generation", description: "Sends prompt, character and world references to your video provider, clip by clip.", status: "GENERATING", capability: "video_generation" },
  { key: "video_analysis", label: "Video analysis", description: "Compares the video to the meta prompt, designs and storyboard, second by second.", status: "REVIEWING", capability: "video_analysis" },
  { key: "editing", label: "Edit / regenerate", description: "Regenerates only the failed parts, then joins the corrected clips.", status: "EDITING", capability: "video_editing" },
  { key: "final_qa", label: "Final QA", description: "Final check. The video is only completed when it passes.", status: "FINAL_QA", capability: "video_analysis" },
  { key: "metadata", label: "Metadata", description: "Title, description, caption and hashtags per platform.", status: "COMPLETED", capability: "text" },
];

/** Stages whose result is locked once done — later stages must follow it exactly. */
export const LOCKED_STAGES = new Set(["characters", "world"]);

/** Activity log wording when a stage finishes. */
export const STAGE_DONE_EVENT: Record<string, string> = {
  meta_prompt: "Meta prompt created", analysis: "Meta prompt passed QA", characters: "Character created",
  world: "World & style locked", storyboard: "Storyboard completed", final_prompt: "Final video prompt ready",
  generate_video: "Video generated", video_analysis: "Video QA completed", editing: "Edits applied",
  final_qa: "Final video approved", metadata: "Title, caption & hashtags written",
};

/** Simple board columns for the dashboard. Each project status maps to exactly one column. */
export const BOARD_COLUMNS = [
  { key: "idea", label: "Idea" },
  { key: "meta", label: "Meta prompt" },
  { key: "character", label: "Character" },
  { key: "storyboard", label: "Storyboard" },
  { key: "generating", label: "Generating" },
  { key: "reviewing", label: "Reviewing" },
  { key: "editing", label: "Editing" },
  { key: "completed", label: "Completed" },
  { key: "published", label: "Published" },
] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number]["key"];

const STATUS_COLUMN: Record<ProjectStatus, BoardColumn> = {
  DRAFT: "idea", META_PROMPT: "meta", ANALYZING: "meta", CHARACTER_DESIGN: "character", WORLD_DESIGN: "character",
  STORYBOARD: "storyboard", VIDEO_PROMPT: "storyboard", GENERATING: "generating", REGENERATING: "generating",
  REVIEWING: "reviewing", FINAL_QA: "reviewing", EDITING: "editing", COMPLETED: "completed", FAILED: "idea",
};

/** Failed projects stay in the column of the stage that failed. */
export function boardColumnFor(status: string, currentStage: string | null, published: boolean): BoardColumn {
  if (status === "COMPLETED") return published ? "published" : "completed";
  if (status === "FAILED") {
    const st = STAGES.find((s) => s.key === currentStage)?.status;
    return st && st !== "COMPLETED" ? STATUS_COLUMN[st] : st === "COMPLETED" ? "reviewing" : "idea";
  }
  return STATUS_COLUMN[status as ProjectStatus] ?? "idea";
}

export const STAGE_KEYS = STAGES.map((s) => s.key);

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  DRAFT: "Draft", META_PROMPT: "Meta prompt", ANALYZING: "Analyzing", CHARACTER_DESIGN: "Character design",
  WORLD_DESIGN: "World design", STORYBOARD: "Storyboard", VIDEO_PROMPT: "Video prompt", GENERATING: "Generating",
  REVIEWING: "Reviewing", EDITING: "Editing", REGENERATING: "Regenerating", FINAL_QA: "Final QA",
  COMPLETED: "Completed", FAILED: "Failed",
};

export type StepStatus = "pending" | "running" | "done" | "failed" | "blocked";

/** Returns the index of the first stage that is not done — the only stage allowed to run next (or any done stage, to redo). */
export function nextRunnableIndex(done: (key: string) => boolean): number {
  const i = STAGES.findIndex((s) => !done(s.key));
  return i === -1 ? STAGES.length : i;
}
