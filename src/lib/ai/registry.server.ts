import type {
  ProviderStatus, TextGenerationProvider, VideoAnalysisProvider, VideoEditingProvider, VideoGenerationProvider, VisionProvider,
} from "./types";
import { createOpenAICompatibleTextProvider } from "./openai-compatible-text.server";
import { createLovableTextProvider } from "./lovable-text.server";

/**
 * Central provider registry. Add new adapters here — each reads its own server secrets.
 * External providers are always preferred over the built-in fallback.
 */
export function getTextProvider(): TextGenerationProvider | null {
  const external = createOpenAICompatibleTextProvider();
  if (external.isConfigured()) return external;
  const fallback = createLovableTextProvider();
  return fallback.isConfigured() ? fallback : null;
}

// Video-related adapters are registered here once their API keys are added.
const visionProviders: VisionProvider[] = [];
const videoGenerationProviders: VideoGenerationProvider[] = [];
const videoAnalysisProviders: VideoAnalysisProvider[] = [];
const videoEditingProviders: VideoEditingProvider[] = [];

const firstConfigured = <T extends { isConfigured(): boolean }>(list: T[]) => list.find((p) => p.isConfigured()) ?? null;

export const getVisionProvider = () => firstConfigured(visionProviders);
export const getVideoGenerationProvider = () => firstConfigured(videoGenerationProviders);
export const getVideoAnalysisProvider = () => firstConfigured(videoAnalysisProviders);
export const getVideoEditingProvider = () => firstConfigured(videoEditingProviders);

export function listProviderStatus(): ProviderStatus[] {
  const text = getTextProvider();
  const external = createOpenAICompatibleTextProvider().isConfigured();
  const row = (capability: ProviderStatus["capability"], label: string, p: { name: string } | null, note: string): ProviderStatus =>
    ({ capability, label, providerName: p?.name ?? null, configured: !!p, note });
  return [
    row("text", "Text generation", text, external ? "Using your own provider." : "Using the built-in fallback. Add AI_TEXT_BASE_URL, AI_TEXT_API_KEY and AI_TEXT_MODEL to use your own."),
    row("vision", "Vision (image understanding)", getVisionProvider(), "Used to check character references."),
    row("video_generation", "Video generation", getVideoGenerationProvider(), "Creates the 3D cartoon video from the final prompt."),
    row("video_analysis", "Video analysis", getVideoAnalysisProvider(), "Reviews the video against the storyboard and runs final QA."),
    row("video_editing", "Video editing", getVideoEditingProvider(), "Fixes or regenerates failed parts."),
  ];
}
