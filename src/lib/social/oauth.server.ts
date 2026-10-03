import type { SocialPlatform, AccountProfile } from "./types";
import { PLATFORM_INFO } from "./types";

// Minimum scopes needed for publishing + basic analytics.
export const SCOPES: Record<SocialPlatform, string[]> = {
  facebook: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "read_insights"],
  youtube: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/youtube.force-ssl", "https://www.googleapis.com/auth/yt-analytics.readonly", "https://www.googleapis.com/auth/yt-analytics-monetary.readonly"],
  tiktok: ["user.info.basic", "user.info.stats", "video.publish", "video.list"],
};

const FB = "https://graph.facebook.com/v21.0";

export function isConfigured(p: SocialPlatform) {
  return PLATFORM_INFO[p].secrets.every((s) => !!process.env[s]);
}
const env = (n: string) => process.env[n]!;

async function json(res: Response, what: string) {
  const body = await res.text();
  if (!res.ok) throw new Error(`${what} failed [${res.status}]: ${body}`);
  return JSON.parse(body);
}

export function buildAuthUrl(p: SocialPlatform, state: string, redirectUri: string, codeChallenge: string) {
  if (p === "facebook") {
    const q = new URLSearchParams({ client_id: env("FACEBOOK_APP_ID"), redirect_uri: redirectUri, state, scope: SCOPES.facebook.join(","), response_type: "code" });
    return `https://www.facebook.com/v21.0/dialog/oauth?${q}`;
  }
  if (p === "youtube") {
    const q = new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), redirect_uri: redirectUri, state, scope: SCOPES.youtube.join(" "), response_type: "code", access_type: "offline", prompt: "consent", include_granted_scopes: "true" });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  const q = new URLSearchParams({ client_key: env("TIKTOK_CLIENT_KEY"), redirect_uri: redirectUri, state, scope: SCOPES.tiktok.join(","), response_type: "code", code_challenge: codeChallenge, code_challenge_method: "S256" });
  return `https://www.tiktok.com/v2/auth/authorize/?${q}`;
}

export interface ConnectedAccount { profile: AccountProfile; accessToken: string; refreshToken?: string | null; expiresAt?: Date | null; scopes: string[] }

/** Exchange the code and return every account (Page/Channel/User) the user authorized. */
export async function exchangeCode(p: SocialPlatform, code: string, redirectUri: string, verifier: string | null): Promise<ConnectedAccount[]> {
  if (p === "facebook") {
    const q = new URLSearchParams({ client_id: env("FACEBOOK_APP_ID"), client_secret: env("FACEBOOK_APP_SECRET"), redirect_uri: redirectUri, code });
    const short = await json(await fetch(`${FB}/oauth/access_token?${q}`), "Facebook token exchange");
    const lq = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: env("FACEBOOK_APP_ID"), client_secret: env("FACEBOOK_APP_SECRET"), fb_exchange_token: short.access_token });
    const long = await json(await fetch(`${FB}/oauth/access_token?${lq}`), "Facebook long-lived token");
    const pages = await json(await fetch(`${FB}/me/accounts?fields=id,name,access_token,picture{url}&access_token=${encodeURIComponent(long.access_token)}`), "Facebook Pages list");
    // Page tokens derived from a long-lived user token do not expire.
    return (pages.data ?? []).map((pg: any) => ({
      profile: { externalId: pg.id, name: pg.name, avatarUrl: pg.picture?.data?.url },
      accessToken: pg.access_token, refreshToken: null, expiresAt: null, scopes: SCOPES.facebook,
    }));
  }
  if (p === "youtube") {
    const tok = await json(await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), redirect_uri: redirectUri, grant_type: "authorization_code" }),
    }), "Google token exchange");
    const ch = await json(await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${tok.access_token}` } }), "YouTube channels");
    return (ch.items ?? []).map((c: any) => ({
      profile: { externalId: c.id, name: c.snippet.title, avatarUrl: c.snippet.thumbnails?.default?.url },
      accessToken: tok.access_token, refreshToken: tok.refresh_token ?? null,
      expiresAt: new Date(Date.now() + tok.expires_in * 1000), scopes: String(tok.scope ?? "").split(" "),
    }));
  }
  const tok = await json(await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: env("TIKTOK_CLIENT_KEY"), client_secret: env("TIKTOK_CLIENT_SECRET"), code, grant_type: "authorization_code", redirect_uri: redirectUri, code_verifier: verifier ?? "" }),
  }), "TikTok token exchange");
  if (tok.error) throw new Error(`TikTok token exchange failed: ${tok.error_description ?? tok.error}`);
  const u = await json(await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url", { headers: { Authorization: `Bearer ${tok.access_token}` } }), "TikTok user info");
  const user = u.data?.user ?? {};
  return [{
    profile: { externalId: user.open_id ?? tok.open_id, name: user.display_name ?? "TikTok account", avatarUrl: user.avatar_url },
    accessToken: tok.access_token, refreshToken: tok.refresh_token ?? null,
    expiresAt: new Date(Date.now() + tok.expires_in * 1000), scopes: String(tok.scope ?? "").split(","),
  }];
}

/** Refresh an expiring token. Facebook Page tokens do not need refreshing. */
export async function refreshAccess(p: SocialPlatform, refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date }> {
  if (p === "youtube") {
    const t = await json(await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), refresh_token: refreshToken, grant_type: "refresh_token" }),
    }), "Google token refresh");
    return { accessToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) };
  }
  if (p === "tiktok") {
    const t = await json(await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: env("TIKTOK_CLIENT_KEY"), client_secret: env("TIKTOK_CLIENT_SECRET"), grant_type: "refresh_token", refresh_token: refreshToken }),
    }), "TikTok token refresh");
    if (t.error) throw new Error(`TikTok token refresh failed: ${t.error_description ?? t.error}`);
    return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) };
  }
  throw new Error("Facebook Page tokens cannot be refreshed — reconnect the Page.");
}

/**
 * Revoke access at the platform when the user disconnects. Best effort: the stored tokens are
 * deleted either way. Returns a note describing what happened at the platform.
 */
export async function revokeAccess(p: SocialPlatform, accessToken: string, refreshToken: string | null): Promise<string> {
  if (!isConfigured(p)) return "Platform app keys missing — removed locally only.";
  if (p === "youtube") {
    const res = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken ?? accessToken)}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" } });
    return res.ok ? "Access revoked at Google." : `Google revoke returned ${res.status} — remove the app at myaccount.google.com/permissions if it still appears.`;
  }
  if (p === "tiktok") {
    const res = await fetch("https://open.tiktokapis.com/v2/oauth/revoke/", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: env("TIKTOK_CLIENT_KEY"), client_secret: env("TIKTOK_CLIENT_SECRET"), token: accessToken }),
    });
    return res.ok ? "Access revoked at TikTok." : `TikTok revoke returned ${res.status} — remove the app in TikTok settings if it still appears.`;
  }
  // Page tokens can't revoke the whole app grant; the user removes it under Facebook Settings → Business integrations.
  return "Tokens deleted. To fully remove access, open Facebook Settings → Business integrations and remove this app.";
}
