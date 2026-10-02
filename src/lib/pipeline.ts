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
  { key: "meta_prompt", label: "Meta prompt", description: "Turns the idea into a complete production brief using the active skill.", status: "META_PROMPT", capability: "text" },
  { key: "analysis", label: "Meta prompt analysis", description: "Checks the brief end-to-end and produces a corrected final brief.", status: "ANALYZING", capability: "text" },
  { key: "characters", label: "Character creation", description: "Designs every character: look, personality, outfit, voice.", status: "CHARACTER_DESIGN", capability: "text" },
  { key: "world", label: "World & style", description: "Setting, lighting, palette and 3D cartoon render style.", status: "WORLD_DESIGN", capability: "text" },
  { key: "storyboard", label: "Storyboard", description: "Second-by-second shots, camera, action and audio.", status: "STORYBOARD", capability: "text" },
  { key: "final_prompt", label: "Final video prompt", description: "The exact prompt sent to the video provider.", status: "VIDEO_PROMPT", capability: "text" },
  { key: "generate_video", label: "Video generation", description: "Sends the final prompt to your video provider.", status: "GENERATING", capability: "video_generation" },
  { key: "video_analysis", label: "Video analysis", description: "Compares the video to the storyboard, second by second.", status: "REVIEWING", capability: "video_analysis" },
  { key: "editing", label: "Editing instructions", description: "Fixes or regenerates the parts that failed review.", status: "EDITING", capability: "video_editing" },
  { key: "final_qa", label: "Final QA", description: "Final quality check of the finished video.", status: "FINAL_QA", capability: "video_analysis" },
  { key: "metadata", label: "Metadata", description: "Title, description, caption and hashtags per platform.", status: "COMPLETED", capability: "text" },
];

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
