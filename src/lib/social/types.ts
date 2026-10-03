// Common social publishing contract. Adapters live in *.server.ts files.
export type SocialPlatform = "facebook" | "youtube" | "tiktok";
export const PLATFORMS: SocialPlatform[] = ["facebook", "youtube", "tiktok"];

export const NOT_AVAILABLE = "Not available through the current official API.";

export class CapabilityNotAvailableError extends Error {
  constructor(detail?: string) { super(detail ? `${NOT_AVAILABLE} ${detail}` : NOT_AVAILABLE); }
}

export interface PublishInput {
  videoUrl: string;
  title: string;
  description: string;
  tags: string[];
  thumbnailUrl?: string | undefined;
  /** youtube: public|unlisted|private · tiktok: PUBLIC_TO_EVERYONE|MUTUAL_FOLLOW_FRIENDS|FOLLOWER_OF_CREATOR|SELF_ONLY */
  privacy?: string | undefined;
  categoryId?: string | undefined;
  playlistId?: string | undefined;
}

export interface PublishResult { externalPostId: string; status: PublishStatus; url?: string | undefined }
export type PublishStatus = "processing" | "scheduled" | "published" | "failed";

export interface AccountProfile { externalId: string; name: string; avatarUrl?: string | undefined }
export interface PostAnalytics { views?: number; likes?: number; comments?: number; shares?: number; watchTimeMinutes?: number; avgViewSeconds?: number }
export interface AccountMetrics { followers?: number | undefined; totalViews?: number | undefined; totalLikes?: number | undefined; videoCount?: number | undefined }
export const REVENUE_UNAVAILABLE = "Revenue data unavailable through the connected API.";
export type EarningsResult =
  | { available: true; currency: string; days: { date: string; amount: number }[] }
  | { available: false; reason: string };

export interface AccountCredentials { accessToken: string; refreshToken?: string | null; externalId: string }

export interface SocialPublisher {
  platform: SocialPlatform;
  publishVideo(cred: AccountCredentials, input: PublishInput): Promise<PublishResult>;
  scheduleVideo(cred: AccountCredentials, input: PublishInput & { publishAt: Date }): Promise<PublishResult>;
  getPublishStatus(cred: AccountCredentials, externalPostId: string): Promise<{ status: PublishStatus; detail?: string }>;
  getAccount(cred: AccountCredentials): Promise<AccountProfile>;
  getAnalytics(cred: AccountCredentials, externalPostId: string): Promise<PostAnalytics>;
  getAccountMetrics(cred: AccountCredentials): Promise<AccountMetrics>;
  /** Verified revenue only. Never estimated. */
  getEarnings(cred: AccountCredentials, from: string, to: string): Promise<EarningsResult>;
}

export const PLATFORM_INFO: Record<SocialPlatform, { name: string; unit: string; secrets: [string, string]; capabilities: { label: string; available: boolean }[] }> = {
  facebook: {
    name: "Facebook", unit: "Page", secrets: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],
    capabilities: [
      { label: "Publish video to Page", available: true },
      { label: "Schedule video", available: true },
      { label: "Video insights", available: true },
      { label: "Personal profile posting", available: false },
    ],
  },
  youtube: {
    name: "YouTube", unit: "Channel", secrets: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    capabilities: [
      { label: "Upload with title, description, tags, category", available: true },
      { label: "Privacy + scheduled publishing", available: true },
      { label: "Custom thumbnail (verified channels)", available: true },
      { label: "Add to playlist", available: true },
    ],
  },
  tiktok: {
    name: "TikTok", unit: "Account", secrets: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    capabilities: [
      { label: "Direct post (approved apps)", available: true },
      { label: "Creator privacy options", available: true },
      { label: "Scheduled posting", available: false },
      { label: "Custom thumbnail upload", available: false },
    ],
  },
};
