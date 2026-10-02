// Client-safe definitions of the production pipeline.
export type StepKind = "ai_text" | "external";

export interface PipelineStepDef {
  key: string;
  label: string;
  description: string;
  kind: StepKind;
  /** For external steps: which provider category must be connected. */
  requires?: "video" | "social";
}

export const PIPELINE_STEPS: PipelineStepDef[] = [
  { key: "meta_prompt", label: "Master meta prompt", description: "Turns the idea into a complete production brief using the active skill.", kind: "ai_text" },
  { key: "analysis", label: "Meta prompt analysis", description: "Checks the brief end-to-end for gaps, risks and consistency.", kind: "ai_text" },
  { key: "characters", label: "Character design", description: "Designs every character: look, personality, outfit, voice.", kind: "ai_text" },
  { key: "world", label: "World & visual style", description: "Defines the setting, lighting, color palette and 3D cartoon style.", kind: "ai_text" },
  { key: "storyboard", label: "Per-second storyboard", description: "Second-by-second shots, camera moves, action and audio.", kind: "ai_text" },
  { key: "final_prompt", label: "Final video prompt", description: "The final prompt sent to the video AI provider.", kind: "ai_text" },
  { key: "generate_video", label: "Generate video", description: "Sends the final prompt to the connected video AI provider.", kind: "external", requires: "video" },
  { key: "review", label: "Review against storyboard", description: "Compares the video to the storyboard and flags failed parts.", kind: "external", requires: "video" },
  { key: "metadata", label: "Title, description & hashtags", description: "Writes the title, description, caption and hashtags for each platform.", kind: "ai_text" },
  { key: "publish", label: "Schedule or publish", description: "Publishes to Facebook, YouTube and TikTok.", kind: "external", requires: "social" },
];

export const AI_STEP_KEYS = PIPELINE_STEPS.filter((s) => s.kind === "ai_text").map((s) => s.key);

export type StepStatus = "pending" | "running" | "done" | "failed" | "blocked";
