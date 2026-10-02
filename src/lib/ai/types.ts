// Client-safe provider contracts. Implementations live in *.server.ts files.

export interface AIProvider {
  id: string;
  name: string;
  /** true when credentials are present on the server */
  isConfigured(): boolean;
}

export interface TextGenerationProvider extends AIProvider {
  generate(input: { system: string; prompt: string }): Promise<{ text: string; model: string }>;
}

export interface VisionProvider extends AIProvider {
  describeImage(input: { imageUrl: string; instruction: string }): Promise<{ text: string }>;
}

/** One clip of a multi-clip generation; times are in seconds of the final video. */
export interface ClipRequest {
  index: number;
  from: number;
  to: number;
  prompt: string;
}

export interface VideoGenerationInput {
  mode: "text_to_video" | "image_to_video";
  prompt: string;
  negativePrompt?: string;
  durationSeconds: number;
  aspectRatio: string;
  /** Character / world reference images (locked designs). */
  referenceImageUrls?: string[];
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  /** Seed for consistency, where the provider supports it. */
  seed?: number;
  /** When set, the provider generates these clips separately for later assembly. */
  clips?: ClipRequest[];
}

export interface VideoGenerationProvider extends AIProvider {
  supports: { imageToVideo: boolean; referenceImages: boolean; firstLastFrame: boolean; seed: boolean; maxClipSeconds: number };
  submit(input: VideoGenerationInput): Promise<{ jobIds: string[] }>;
  poll(jobId: string): Promise<{ status: "queued" | "running" | "succeeded" | "failed"; videoUrl?: string; error?: string }>;
}

export type DefectKind =
  | "character_inconsistency" | "bad_animation" | "broken_object" | "wrong_camera" | "missing_scene"
  | "wrong_timing" | "bad_expression" | "lip_sync" | "audio" | "visual_artifact" | "wrong_ending";

export interface FailedSegment {
  from: number;
  to: number;
  clipIndex?: number;
  kind: DefectKind;
  reason: string;
}

export interface VideoAnalysisProvider extends AIProvider {
  /** Compares a video against meta prompt, character, world, per-second storyboard and final prompt. */
  analyze(input: {
    videoUrl: string;
    metaPrompt: string;
    characters: string;
    world: string;
    storyboard: string;
    finalPrompt: string;
    instruction: string;
  }): Promise<{ report: string; passed: boolean; failedSegments: FailedSegment[] }>;
}

export interface VideoEditingProvider extends AIProvider {
  /** Regenerates only the failed segments, then assembles the corrected clips. */
  regenerateSegments(input: { segments: (FailedSegment & { prompt: string })[]; clipUrls: string[] }): Promise<{ jobIds: string[] }>;
  assemble(input: { clipUrls: string[] }): Promise<{ jobId: string }>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(public capability: string) {
    super(`No ${capability.replace("_", " ")} provider is connected. Add one in AI Providers to continue this stage.`);
  }
}

export interface ProviderStatus {
  capability: "text" | "vision" | "video_generation" | "video_analysis" | "video_editing";
  label: string;
  providerName: string | null;
  configured: boolean;
  note: string;
}
