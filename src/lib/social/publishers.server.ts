import { CapabilityNotAvailableError, REVENUE_UNAVAILABLE, type AccountCredentials, type PostAnalytics, type PublishInput, type PublishResult, type SocialPlatform, type SocialPublisher } from "./types";

const FB = "https://graph.facebook.com/v21.0";
const YT = "https://www.googleapis.com/youtube/v3";
const TT = "https://open.tiktokapis.com/v2";
const YTA = "https://youtubeanalytics.googleapis.com/v2/reports";

async function json(res: Response, what: string) {
  const body = await res.text();
  if (!res.ok) throw new Error(`${what} failed [${res.status}]: ${body}`);
  return body ? JSON.parse(body) : {};
}

const caption = (i: PublishInput) => [i.description, i.tags.map((t) => `#${t.replace(/^#/, "")}`).join(" ")].filter(Boolean).join("\n\n");

export const FacebookPublisher: SocialPublisher = {
  platform: "facebook",
  async publishVideo(c, i) {
    const r = await json(await fetch(`${FB}/${c.externalId}/videos`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ file_url: i.videoUrl, title: i.title, description: caption(i), access_token: c.accessToken }),
    }), "Facebook video publish");
    return { externalPostId: r.id, status: "processing", url: `https://www.facebook.com/${r.id}` };
  },
  async scheduleVideo(c, i) {
    const r = await json(await fetch(`${FB}/${c.externalId}/videos`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ file_url: i.videoUrl, title: i.title, description: caption(i), published: false, scheduled_publish_time: Math.floor(i.publishAt.getTime() / 1000), access_token: c.accessToken }),
    }), "Facebook video schedule");
    return { externalPostId: r.id, status: "scheduled" };
  },
  async getPublishStatus(c, id) {
    const r = await json(await fetch(`${FB}/${id}?fields=status&access_token=${encodeURIComponent(c.accessToken)}`), "Facebook status");
    const s = r.status?.video_status;
    return { status: s === "ready" ? "published" : s === "error" ? "failed" : "processing", detail: s };
  },
  async getAccount(c) {
    const r = await json(await fetch(`${FB}/${c.externalId}?fields=id,name,picture{url}&access_token=${encodeURIComponent(c.accessToken)}`), "Facebook Page");
    return { externalId: r.id, name: r.name, avatarUrl: r.picture?.data?.url };
  },
  async getAnalytics(c, id) {
    const r = await json(await fetch(`${FB}/${id}?fields=views,likes.summary(true),comments.summary(true)&access_token=${encodeURIComponent(c.accessToken)}`), "Facebook analytics");
    const out: PostAnalytics = { views: r.views, likes: r.likes?.summary?.total_count, comments: r.comments?.summary?.total_count };
    try { // needs read_insights; skipped quietly when not granted
      const ins = await json(await fetch(`${FB}/${id}/video_insights?metric=total_video_view_total_time,total_video_avg_time_watched&access_token=${encodeURIComponent(c.accessToken)}`), "Facebook video insights");
      for (const m of ins.data ?? []) {
        const v = m.values?.[0]?.value;
        if (m.name === "total_video_view_total_time" && typeof v === "number") out.watchTimeMinutes = v / 60000;
        if (m.name === "total_video_avg_time_watched" && typeof v === "number") out.avgViewSeconds = v / 1000;
      }
    } catch { /* optional */ }
    return out;
  },
  async getAccountMetrics(c) {
    const r = await json(await fetch(`${FB}/${c.externalId}?fields=followers_count,fan_count&access_token=${encodeURIComponent(c.accessToken)}`), "Facebook Page stats");
    return { followers: r.followers_count ?? r.fan_count };
  },
  async getEarnings() {
    return { available: false, reason: `${REVENUE_UNAVAILABLE} Facebook does not expose Page monetization payouts to this app's permissions.` };
  },
};

async function ytUpload(c: AccountCredentials, i: PublishInput, publishAt?: Date): Promise<PublishResult> {
  const meta = {
    snippet: { title: i.title.slice(0, 100), description: caption(i).slice(0, 5000), tags: i.tags, categoryId: i.categoryId ?? "1" },
    status: publishAt ? { privacyStatus: "private", publishAt: publishAt.toISOString(), selfDeclaredMadeForKids: false } : { privacyStatus: i.privacy ?? "private", selfDeclaredMadeForKids: false },
  };
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST", headers: { Authorization: `Bearer ${c.accessToken}`, "content-type": "application/json", "X-Upload-Content-Type": "video/mp4" }, body: JSON.stringify(meta),
  });
  if (!init.ok) throw new Error(`YouTube upload init failed [${init.status}]: ${await init.text()}`);
  const uploadUrl = init.headers.get("location")!;
  const file = await fetch(i.videoUrl);
  if (!file.ok) throw new Error(`Could not download the final video [${file.status}]`);
  const v = await json(await fetch(uploadUrl, { method: "PUT", headers: { "content-type": "video/mp4" }, body: await file.arrayBuffer() }), "YouTube upload");
  if (i.thumbnailUrl) {
    const t = await fetch(i.thumbnailUrl);
    if (t.ok) await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${v.id}`, { method: "POST", headers: { Authorization: `Bearer ${c.accessToken}`, "content-type": t.headers.get("content-type") ?? "image/jpeg" }, body: await t.arrayBuffer() });
  }
  if (i.playlistId) {
    await json(await fetch(`${YT}/playlistItems?part=snippet`, { method: "POST", headers: { Authorization: `Bearer ${c.accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ snippet: { playlistId: i.playlistId, resourceId: { kind: "youtube#video", videoId: v.id } } }) }), "YouTube playlist add");
  }
  return { externalPostId: v.id, status: publishAt ? "scheduled" : "processing", url: `https://youtu.be/${v.id}` };
}

export const YouTubePublisher: SocialPublisher = {
  platform: "youtube",
  publishVideo: (c, i) => ytUpload(c, i),
  scheduleVideo: (c, i) => ytUpload(c, i, i.publishAt),
  async getPublishStatus(c, id) {
    const r = await json(await fetch(`${YT}/videos?part=status,processingDetails&id=${id}`, { headers: { Authorization: `Bearer ${c.accessToken}` } }), "YouTube status");
    const v = r.items?.[0];
    if (!v) return { status: "failed", detail: "Video not found" };
    if (v.status.uploadStatus === "failed" || v.status.uploadStatus === "rejected") return { status: "failed", detail: v.status.failureReason ?? v.status.rejectionReason };
    if (v.status.publishAt && v.status.privacyStatus === "private") return { status: "scheduled", detail: v.status.publishAt };
    return { status: v.status.uploadStatus === "processed" ? "published" : "processing", detail: v.status.privacyStatus };
  },
  async getAccount(c) {
    const r = await json(await fetch(`${YT}/channels?part=snippet&id=${c.externalId}`, { headers: { Authorization: `Bearer ${c.accessToken}` } }), "YouTube channel");
    const ch = r.items?.[0];
    return { externalId: c.externalId, name: ch?.snippet?.title ?? "YouTube channel", avatarUrl: ch?.snippet?.thumbnails?.default?.url };
  },
  async getAnalytics(c, id) {
    const r = await json(await fetch(`${YT}/videos?part=statistics&id=${id}`, { headers: { Authorization: `Bearer ${c.accessToken}` } }), "YouTube analytics");
    const s = r.items?.[0]?.statistics ?? {};
    const out: PostAnalytics = { views: Number(s.viewCount ?? 0), likes: Number(s.likeCount ?? 0), comments: Number(s.commentCount ?? 0) };
    try {
      const today = new Date().toISOString().slice(0, 10);
      const rep = await json(await fetch(`${YTA}?ids=channel==MINE&startDate=2005-01-01&endDate=${today}&metrics=estimatedMinutesWatched,averageViewDuration,shares&filters=video==${id}`, { headers: { Authorization: `Bearer ${c.accessToken}` } }), "YouTube Analytics");
      const row = rep.rows?.[0];
      if (row) { out.watchTimeMinutes = Number(row[0]); out.avgViewSeconds = Number(row[1]); out.shares = Number(row[2]); }
    } catch { /* yt-analytics scope not granted */ }
    return out;
  },
  async getAccountMetrics(c) {
    const r = await json(await fetch(`${YT}/channels?part=statistics&id=${c.externalId}`, { headers: { Authorization: `Bearer ${c.accessToken}` } }), "YouTube channel stats");
    const st = r.items?.[0]?.statistics ?? {};
    return { followers: st.hiddenSubscriberCount ? undefined : Number(st.subscriberCount ?? 0), totalViews: Number(st.viewCount ?? 0), videoCount: Number(st.videoCount ?? 0) };
  },
  async getEarnings(c, from, to) {
    const res = await fetch(`${YTA}?ids=channel==MINE&startDate=${from}&endDate=${to}&metrics=estimatedRevenue&dimensions=day&currency=USD`, { headers: { Authorization: `Bearer ${c.accessToken}` } });
    if (res.status === 401 || res.status === 403) {
      const t = await res.text();
      return { available: false, reason: `${REVENUE_UNAVAILABLE} ${/insufficient|scope/i.test(t) ? "Reconnect YouTube and allow revenue access." : "This channel is not in the YouTube Partner Program or revenue access was refused."}` };
    }
    const r = await json(res, "YouTube revenue");
    return { available: true, currency: "USD", days: (r.rows ?? []).map((row: [string, number]) => ({ date: row[0], amount: Number(row[1]) })) };
  },
};

export const TikTokPublisher: SocialPublisher = {
  platform: "tiktok",
  async publishVideo(c, i) {
    // TikTok requires reading the creator's allowed privacy levels before posting.
    const info = await json(await fetch(`${TT}/post/publish/creator_info/query/`, { method: "POST", headers: { Authorization: `Bearer ${c.accessToken}`, "content-type": "application/json; charset=UTF-8" } }), "TikTok creator info");
    const allowed: string[] = info.data?.privacy_level_options ?? [];
    const privacy = i.privacy && allowed.includes(i.privacy) ? i.privacy : allowed.includes("SELF_ONLY") ? "SELF_ONLY" : allowed[0];
    if (!privacy) throw new Error("TikTok did not return any allowed privacy options for this account.");
    const r = await json(await fetch(`${TT}/post/publish/video/init/`, {
      method: "POST", headers: { Authorization: `Bearer ${c.accessToken}`, "content-type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ post_info: { title: caption({ ...i, description: i.title }).slice(0, 2200), privacy_level: privacy }, source_info: { source: "PULL_FROM_URL", video_url: i.videoUrl } }),
    }), "TikTok publish");
    if (r.error?.code && r.error.code !== "ok") throw new Error(`TikTok publish failed: ${r.error.message}`);
    return { externalPostId: r.data.publish_id, status: "processing" };
  },
  async scheduleVideo() { throw new CapabilityNotAvailableError("TikTok does not offer scheduled posting."); },
  async getPublishStatus(c, id) {
    const r = await json(await fetch(`${TT}/post/publish/status/fetch/`, { method: "POST", headers: { Authorization: `Bearer ${c.accessToken}`, "content-type": "application/json; charset=UTF-8" }, body: JSON.stringify({ publish_id: id }) }), "TikTok status");
    const s = r.data?.status;
    return { status: s === "PUBLISH_COMPLETE" ? "published" : s === "FAILED" ? "failed" : "processing", detail: r.data?.fail_reason ?? s };
  },
  async getAccount(c) {
    const r = await json(await fetch(`${TT}/user/info/?fields=open_id,display_name,avatar_url`, { headers: { Authorization: `Bearer ${c.accessToken}` } }), "TikTok user");
    const u = r.data?.user ?? {};
    return { externalId: u.open_id ?? c.externalId, name: u.display_name ?? "TikTok account", avatarUrl: u.avatar_url };
  },
  async getAnalytics(c, id) {
    const r = await json(await fetch(`${TT}/video/query/?fields=id,view_count,like_count,comment_count,share_count`, { method: "POST", headers: { Authorization: `Bearer ${c.accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ filters: { video_ids: [id] } }) }), "TikTok analytics");
    const v = r.data?.videos?.[0] ?? {};
    return { views: v.view_count, likes: v.like_count, comments: v.comment_count, shares: v.share_count };
  },
  async getAccountMetrics(c) {
    const r = await json(await fetch(`${TT}/user/info/?fields=follower_count,likes_count,video_count`, { headers: { Authorization: `Bearer ${c.accessToken}` } }), "TikTok user stats");
    const u = r.data?.user ?? {};
    return { followers: u.follower_count, totalLikes: u.likes_count, videoCount: u.video_count };
  },
  async getEarnings() {
    return { available: false, reason: `${REVENUE_UNAVAILABLE} TikTok's official API does not provide creator earnings.` };
  },
};

export const PUBLISHERS: Record<SocialPlatform, SocialPublisher> = { facebook: FacebookPublisher, youtube: YouTubePublisher, tiktok: TikTokPublisher };
