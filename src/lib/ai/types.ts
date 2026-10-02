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

export interface VideoGenerationProvider extends AIProvider {
  submit(input: { prompt: string; durationSeconds: number; aspectRatio: string }): Promise<{ jobId: string }>;
  poll(jobId: string): Promise<{ status: "queued" | "running" | "succeeded" | "failed"; videoUrl?: string; error?: string }>;
}

export interface VideoAnalysisProvider extends AIProvider {
  analyze(input: { videoUrl: string; storyboard: string; instruction: string }): Promise<{ report: string; failedSegments: { from: number; to: number; reason: string }[] }>;
}

export interface VideoEditingProvider extends AIProvider {
  edit(input: { videoUrl: string; instructions: string }): Promise<{ jobId: string }>;
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
