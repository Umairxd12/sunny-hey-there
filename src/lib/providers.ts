// Provider adapter contracts. Real implementations live server-side and are
// registered once credentials are added as secrets.

export interface VideoJob { jobId: string; status: "queued" | "running" | "succeeded" | "failed"; videoUrl?: string; error?: string }

export interface VideoProvider {
  id: string;
  submit(input: { prompt: string; durationSeconds: number; aspectRatio: string }): Promise<VideoJob>;
  poll(jobId: string): Promise<VideoJob>;
}

export interface SocialPublisher {
  platform: SocialPlatform;
  getAuthUrl(redirectUri: string): Promise<string>;
  publish(input: { videoUrl: string; title: string; caption: string; hashtags: string[] }): Promise<{ externalPostId: string }>;
  schedule(input: { videoUrl: string; title: string; caption: string; hashtags: string[]; at: Date }): Promise<{ externalPostId: string }>;
}

export interface AnalyticsSource {
  platform: SocialPlatform;
  fetchMetrics(externalPostId: string): Promise<{ views: number; likes: number; comments: number; shares: number }>;
}

export type SocialPlatform = "facebook" | "youtube" | "tiktok";

export interface ProviderInfo {
  id: string;
  name: string;
  category: "text" | "video" | "social";
  status: "connected" | "not_connected";
  description: string;
  needs: string;
}

export const PROVIDERS: ProviderInfo[] = [
  { id: "lovable-ai", name: "Lovable AI (text)", category: "text", status: "connected", description: "Writes meta prompts, characters, worlds, storyboards and captions.", needs: "Ready to use" },
  { id: "video-ai", name: "Video AI provider", category: "video", status: "not_connected", description: "Turns the final prompt into a 3D cartoon video.", needs: "Set up in the next phase" },
  { id: "facebook", name: "Facebook Page", category: "social", status: "not_connected", description: "Publish and schedule videos to your Facebook Page.", needs: "Meta app ID and secret" },
  { id: "youtube", name: "YouTube Channel", category: "social", status: "not_connected", description: "Upload Shorts and videos to your channel.", needs: "Google OAuth client" },
  { id: "tiktok", name: "TikTok Account", category: "social", status: "not_connected", description: "Post videos to your TikTok account.", needs: "TikTok developer app" },
];
