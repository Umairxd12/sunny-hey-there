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
