import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { REVENUE_UNAVAILABLE } from "./social/types";

const range = z.object({ from: z.string().datetime(), to: z.string().datetime() });
const num = (v: unknown) => (v == null ? null : Number(v));

export const syncAnalyticsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: recent } = await context.supabase.from("sync_logs").select("started_at").eq("trigger", "manual").order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (recent && Date.now() - new Date(recent.started_at).getTime() < 60_000) return { ok: false as const, error: "Please wait a minute between manual syncs." };
    const { syncUserAnalytics } = await import("./analytics/analytics.server");
    const results = await syncUserAnalytics(context.userId, "manual");
    return { ok: true as const, results };
  });

export const getAnalyticsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => range.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [{ data: accounts }, { data: posts }, { count: totalVideos }, { data: logs }, { data: snaps }, { data: earnings }, { data: thumbs }] = await Promise.all([
      sb.from("social_accounts").select("id, platform, account_name, avatar_url, status, last_sync_at, last_error").eq("status", "connected"),
      sb.from("scheduled_posts").select("id, project_id, platform, social_account_id, title, status, published_at, published_url, scheduled_for, created_at"),
      sb.from("videos").select("id", { count: "exact", head: true }),
      sb.from("sync_logs").select("platform, account_id, status, message, started_at, finished_at").order("started_at", { ascending: false }).limit(30),
      sb.from("analytics_snapshots").select("captured_at, followers, views, likes, comments, shares").gte("captured_at", data.from).lte("captured_at", data.to).order("captured_at"),
      sb.from("earnings_records").select("platform, account_id, period_start, amount, currency, verified").gte("period_start", data.from.slice(0, 10)).lte("period_start", data.to.slice(0, 10)),
      sb.from("video_assets").select("project_id, url").eq("kind", "thumbnail"),
    ]);
    const inRange = (d: string | null) => !!d && d >= data.from && d <= data.to;
    const published = (posts ?? []).filter((p) => p.status === "PUBLISHED" && inRange(p.published_at));
    const ids = published.map((p) => p.id);

    // Latest metric per video.
    const latest = new Map<string, { views: number | null; likes: number | null; comments: number | null; shares: number | null; watch_time_minutes: number | null; avg_view_seconds: number | null; captured_at: string }>();
    if (ids.length) {
      const { data: vm } = await sb.from("video_metrics").select("post_id, views, likes, comments, shares, watch_time_minutes, avg_view_seconds, captured_at").in("post_id", ids).order("captured_at", { ascending: false }).limit(5000);
      for (const m of vm ?? []) if (!latest.has(m.post_id)) latest.set(m.post_id, { views: num(m.views), likes: num(m.likes), comments: num(m.comments), shares: num(m.shares), watch_time_minutes: num(m.watch_time_minutes), avg_view_seconds: num(m.avg_view_seconds), captured_at: m.captured_at });
    }
    // Latest followers per account.
    const accIds = (accounts ?? []).map((a) => a.id);
    const followers = new Map<string, number | null>();
    if (accIds.length) {
      const { data: am } = await sb.from("account_metrics").select("account_id, followers, captured_at").in("account_id", accIds).order("captured_at", { ascending: false }).limit(2000);
      for (const m of am ?? []) if (!followers.has(m.account_id)) followers.set(m.account_id, num(m.followers));
    }

    const thumbByProject = new Map((thumbs ?? []).map((t) => [t.project_id, t.url]));
    const videos = published.map((p) => {
      const m = latest.get(p.id);
      const eng = m && m.views ? ((m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0)) / m.views : null;
      return { ...p, thumbnail: p.project_id ? thumbByProject.get(p.project_id) ?? null : null, metrics: m ?? null, engagement: eng, revenue: null as number | null };
    });

    const sum = (k: "views" | "likes" | "comments" | "shares" | "watch_time_minutes", list = videos) => {
      const vals = list.map((v) => v.metrics?.[k]).filter((x): x is number => x != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
    };
    const totalsFor = (list: typeof videos) => {
      const views = sum("views", list); const inter = (sum("likes", list) ?? 0) + (sum("comments", list) ?? 0) + (sum("shares", list) ?? 0);
      return { views, likes: sum("likes", list), comments: sum("comments", list), shares: sum("shares", list), watchTimeMinutes: sum("watch_time_minutes", list), engagement: views ? inter / views : null };
    };

    const usd = (earnings ?? []).filter((e) => e.verified && e.currency === "USD");
    const earningsBy = (platform: string) => {
      const rows = usd.filter((e) => e.platform === platform);
      return rows.length ? rows.reduce((a, e) => a + Number(e.amount), 0) : null;
    };
    const otherCurrency = (earnings ?? []).filter((e) => e.verified && e.currency !== "USD");

    const accountRows = (accounts ?? []).map((a) => {
      const list = videos.filter((v) => v.social_account_id === a.id);
      const lastLog = (logs ?? []).find((l) => l.account_id === a.id);
      const rows = usd.filter((e) => e.account_id === a.id);
      return { ...a, followers: followers.get(a.id) ?? null, ...totalsFor(list), publishedCount: list.length, recent: list.slice(0, 3).map((v) => ({ id: v.id, title: v.title })),
        latestActivity: list[0]?.published_at ?? a.last_sync_at, earnings: rows.length ? rows.reduce((s, e) => s + Number(e.amount), 0) : null,
        earningsNote: rows.length ? null : lastLog?.message?.includes(REVENUE_UNAVAILABLE) ? lastLog.message : REVENUE_UNAVAILABLE };
    });

    const platforms = (["facebook", "youtube", "tiktok"] as const).map((p) => {
      const accs = accountRows.filter((a) => a.platform === p);
      const f = accs.map((a) => a.followers).filter((x): x is number => x != null);
      return { platform: p, accounts: accs.length, followers: f.length ? f.reduce((a, b) => a + b, 0) : null, published: videos.filter((v) => v.platform === p).length, ...totalsFor(videos.filter((v) => v.platform === p)), earnings: earningsBy(p) };
    });

    const allPosts = posts ?? [];
    const lastSync = (logs ?? [])[0]?.finished_at ?? null;
    const latestPerAccount = new Map<string, NonNullable<typeof logs>[number]>();
    for (const l of logs ?? []) if (l.account_id && !latestPerAccount.has(l.account_id)) latestPerAccount.set(l.account_id, l);
    const syncErrors = [...latestPerAccount.values()].filter((l) => l.status !== "ok" && !(l.status === "partial" && l.message?.startsWith(REVENUE_UNAVAILABLE) && !l.message.includes("·")))
      .map((l) => ({ platform: l.platform, account: accountRows.find((a) => a.id === l.account_id)?.account_name ?? "", status: l.status, message: l.message, at: l.started_at }));

    const f = accountRows.map((a) => a.followers).filter((x): x is number => x != null);
    return {
      counts: {
        totalVideos: totalVideos ?? 0,
        published: published.length,
        scheduled: allPosts.filter((p) => p.status === "SCHEDULED" && (!p.scheduled_for || inRange(p.scheduled_for))).length,
        failed: allPosts.filter((p) => p.status === "FAILED" && inRange(p.created_at)).length,
      },
      totals: { ...totalsFor(videos), followers: f.length ? f.reduce((a, b) => a + b, 0) : null },
      platforms, accounts: accountRows, videos,
      earnings: { totalUsd: usd.length ? usd.reduce((a, e) => a + Number(e.amount), 0) : null, otherCurrency: otherCurrency.map((e) => ({ platform: e.platform, amount: Number(e.amount), currency: e.currency })), conversionConfigured: false },
      timeline: (snaps ?? []).map((s) => ({ at: s.captured_at, followers: Number(s.followers), views: Number(s.views), likes: Number(s.likes) })),
      lastSync, syncErrors, hasAccounts: accountRows.length > 0,
    };
  });

export const getVideoAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ postId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: post } = await sb.from("scheduled_posts").select("id, project_id, platform, social_account_id, title, caption, hashtags, status, published_at, published_url, external_post_id, options").eq("id", data.postId).maybeSingle();
    if (!post) return null;
    const [{ data: metrics }, { data: account }, { data: earnings }, { data: thumb }] = await Promise.all([
      sb.from("video_metrics").select("captured_at, views, likes, comments, shares, watch_time_minutes, avg_view_seconds").eq("post_id", post.id).order("captured_at"),
      post.social_account_id ? sb.from("social_accounts").select("account_name, platform").eq("id", post.social_account_id).maybeSingle() : Promise.resolve({ data: null }),
      sb.from("earnings_records").select("period_start, amount, currency").eq("post_id", post.id),
      post.project_id ? sb.from("video_assets").select("url").eq("project_id", post.project_id).eq("kind", "thumbnail").limit(1).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    return {
      post, account, thumbnail: thumb?.url ?? null,
      timeline: (metrics ?? []).map((m) => ({ at: m.captured_at, views: num(m.views), likes: num(m.likes), comments: num(m.comments), shares: num(m.shares), watch: num(m.watch_time_minutes), avg: num(m.avg_view_seconds) })),
      revenue: (earnings ?? []).length ? (earnings ?? []).reduce((a, e) => a + (e.currency === "USD" ? Number(e.amount) : 0), 0) : null,
    };
  });
