import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLATFORMS, PLATFORM_INFO, NOT_AVAILABLE, type SocialPlatform } from "./social/types";

const platform = z.enum(["facebook", "youtube", "tiktok"]);
const callbackPath = (p: string) => `/api/public/oauth/${p}/callback`;

export const getSocialSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { isConfigured } = await import("./social/oauth.server");
    const origin = new URL(getRequest().url).origin;
    return PLATFORMS.map((p) => ({ platform: p, configured: isConfigured(p), callbackUrl: origin + callbackPath(p), secrets: PLATFORM_INFO[p].secrets }));
  });

export const listSocialAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: accounts }, { data: links }, { data: projects }] = await Promise.all([
      context.supabase.from("social_accounts").select("id, platform, account_name, avatar_url, status, token_status, token_expires_at, last_sync_at, last_published_at, last_published_title, last_error, created_at").order("created_at"),
      context.supabase.from("project_social_accounts").select("project_id, account_id"),
      context.supabase.from("projects").select("id, title").order("updated_at", { ascending: false }),
    ]);
    return { accounts: accounts ?? [], links: links ?? [], projects: projects ?? [] };
  });

export const startSocialConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ platform, reconnectAccountId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { isConfigured, buildAuthUrl } = await import("./social/oauth.server");
    if (!isConfigured(data.platform)) return { ok: false as const, error: `${PLATFORM_INFO[data.platform].name} app credentials are not set up yet.` };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rand = (n: number) => Buffer.from(crypto.getRandomValues(new Uint8Array(n))).toString("base64url");
    const state = rand(24), verifier = rand(48);
    const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
    const redirectUri = new URL(getRequest().url).origin + callbackPath(data.platform);
    const { error } = await supabaseAdmin.from("oauth_states").insert({ state, user_id: context.userId, platform: data.platform, redirect_uri: redirectUri, code_verifier: verifier, reconnect_account_id: data.reconnectAccountId ?? null });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, url: buildAuthUrl(data.platform, state, redirectUri, challenge) };
  });

export const disconnectSocialAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ accountId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: acc } = await context.supabase.from("social_accounts").select("id").eq("id", data.accountId).maybeSingle();
    if (!acc) return { ok: false as const, error: "Account not found." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("social_tokens").delete().eq("account_id", data.accountId);
    await context.supabase.from("social_accounts").update({ status: "disconnected", token_status: "none", updated_at: new Date().toISOString() }).eq("id", data.accountId);
    return { ok: true as const };
  });

export const syncSocialAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ accountId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { getCredentials, markTokenProblem } = await import("./social/accounts.server");
    const { PUBLISHERS } = await import("./social/publishers.server");
    try {
      const { platform: p, cred } = await getCredentials(context.userId, data.accountId);
      const prof = await PUBLISHERS[p].getAccount(cred);
      await context.supabase.from("social_accounts").update({ account_name: prof.name, avatar_url: prof.avatarUrl ?? null, last_sync_at: new Date().toISOString(), token_status: "valid", last_error: null }).eq("id", data.accountId);
      return { ok: true as const };
    } catch (e) {
      const msg = (e as Error).message;
      if (/\[(401|403)\]/.test(msg)) await markTokenProblem(data.accountId, "invalid", msg);
      return { ok: false as const, error: msg };
    }
  });

export const setProjectAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid(), accountIds: z.array(z.string().uuid()) }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("project_social_accounts").delete().eq("project_id", data.projectId);
    if (data.accountIds.length) {
      const { error } = await context.supabase.from("project_social_accounts").insert(data.accountIds.map((account_id) => ({ project_id: data.projectId, account_id })));
      if (error) return { ok: false as const, error: error.message };
    }
    return { ok: true as const };
  });

/** Publish (or schedule) a draft post the user explicitly confirmed. */
export const publishScheduledPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    postId: z.string().uuid(), accountId: z.string().uuid(),
    privacy: z.string().max(40).optional(), categoryId: z.string().max(10).optional(), playlistId: z.string().max(100).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: post } = await context.supabase.from("scheduled_posts").select("*").eq("id", data.postId).maybeSingle();
    if (!post) return { ok: false as const, error: "Post not found." };
    const { data: video } = post.video_id ? await context.supabase.from("videos").select("video_url").eq("id", post.video_id).maybeSingle() : { data: null };
    if (!video?.video_url) return { ok: false as const, error: "This post has no final video file yet." };
    const { getCredentials } = await import("./social/accounts.server");
    const { PUBLISHERS } = await import("./social/publishers.server");
    try {
      const { platform: p, cred } = await getCredentials(context.userId, data.accountId);
      const input = { videoUrl: video.video_url, title: post.title ?? "", description: post.caption ?? "", tags: (post.hashtags ?? "").split(/[\s,]+/).filter(Boolean), privacy: data.privacy, categoryId: data.categoryId, playlistId: data.playlistId };
      const at = post.scheduled_for ? new Date(post.scheduled_for) : null;
      const res = at && at.getTime() > Date.now() ? await PUBLISHERS[p].scheduleVideo(cred, { ...input, publishAt: at }) : await PUBLISHERS[p].publishVideo(cred, input);
      await context.supabase.from("scheduled_posts").update({ platform: p, social_account_id: data.accountId, external_post_id: res.externalPostId, status: res.status, last_error: null, options: { privacy: data.privacy, categoryId: data.categoryId, playlistId: data.playlistId } }).eq("id", data.postId);
      await context.supabase.from("social_accounts").update({ last_published_at: new Date().toISOString(), last_published_title: post.title }).eq("id", data.accountId);
      return { ok: true as const, status: res.status, url: res.url };
    } catch (e) {
      const msg = (e as Error).message;
      await context.supabase.from("scheduled_posts").update({ status: "failed", last_error: msg.slice(0, 500) }).eq("id", data.postId);
      return { ok: false as const, error: msg, notAvailable: msg.startsWith(NOT_AVAILABLE) };
    }
  });

export type { SocialPlatform };
