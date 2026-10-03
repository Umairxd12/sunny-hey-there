import type { SocialPlatform } from "@/lib/social/types";

const MAX_POSTS_PER_ACCOUNT = 50;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Pulls account + video metrics and verified earnings for one user; writes snapshots and per-account sync logs. */
export async function syncUserAnalytics(userId: string, trigger: "manual" | "auto") {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { getCredentials } = await import("@/lib/social/accounts.server");
  const { PUBLISHERS } = await import("@/lib/social/publishers.server");

  const { data: accounts } = await db.from("social_accounts").select("id, platform, account_name").eq("user_id", userId).eq("status", "connected");
  const results: { platform: string; account: string; ok: boolean; message?: string }[] = [];
  const totals = { followers: 0, views: 0, likes: 0, comments: 0, shares: 0 };
  const byPlatform: Record<string, typeof totals> = {};

  for (const acc of accounts ?? []) {
    const started = new Date().toISOString();
    const problems: string[] = [];
    const bucket = (byPlatform[acc.platform] ??= { followers: 0, views: 0, likes: 0, comments: 0, shares: 0 });
    try {
      const { platform, cred } = await getCredentials(userId, acc.id);
      const pub = PUBLISHERS[platform as SocialPlatform];

      const m = await pub.getAccountMetrics(cred);
      await db.from("account_metrics").insert({ user_id: userId, account_id: acc.id, platform, followers: m.followers ?? null, total_views: m.totalViews ?? null, total_likes: m.totalLikes ?? null, video_count: m.videoCount ?? null });
      bucket.followers += m.followers ?? 0;

      const { data: posts } = await db.from("scheduled_posts").select("id, external_post_id").eq("social_account_id", acc.id).eq("status", "PUBLISHED").not("external_post_id", "is", null).order("published_at", { ascending: false }).limit(MAX_POSTS_PER_ACCOUNT);
      for (const p of posts ?? []) {
        try {
          const a = await pub.getAnalytics(cred, p.external_post_id!);
          await db.from("video_metrics").insert({ user_id: userId, post_id: p.id, account_id: acc.id, platform, views: a.views ?? null, likes: a.likes ?? null, comments: a.comments ?? null, shares: a.shares ?? null, watch_time_minutes: a.watchTimeMinutes ?? null, avg_view_seconds: a.avgViewSeconds ?? null });
          bucket.views += a.views ?? 0; bucket.likes += a.likes ?? 0; bucket.comments += a.comments ?? 0; bucket.shares += a.shares ?? 0;
        } catch (e) { problems.push(`video ${p.external_post_id}: ${(e as Error).message.slice(0, 160)}`); }
      }

      const to = new Date(); const from = new Date(Date.now() - 90 * 86400_000);
      const earn = await pub.getEarnings(cred, day(from), day(to));
      if (earn.available && earn.days.length) {
        await db.from("earnings_records").upsert(
          earn.days.map((d) => ({ user_id: userId, account_id: acc.id, platform, period_start: d.date, period_end: d.date, amount: d.amount, currency: earn.currency, source: "api", verified: true, metric: "estimatedRevenue" })),
          { onConflict: "account_id,period_start,period_end,metric,source" },
        );
      }
      await db.from("social_accounts").update({ last_sync_at: new Date().toISOString(), last_error: null, token_status: "valid" }).eq("id", acc.id);
      await db.from("sync_logs").insert({ user_id: userId, account_id: acc.id, platform, status: problems.length ? "partial" : "ok", message: [earn.available ? null : earn.reason, ...problems].filter(Boolean).join(" · ") || null, trigger, started_at: started, finished_at: new Date().toISOString() });
      results.push({ platform, account: acc.account_name ?? "", ok: true, ...(problems.length ? { message: problems.join("; ") } : {}) });
    } catch (e) {
      const msg = (e as Error).message.slice(0, 500);
      await db.from("sync_logs").insert({ user_id: userId, account_id: acc.id, platform: acc.platform, status: "failed", message: msg, trigger, started_at: started, finished_at: new Date().toISOString() });
      await db.from("social_accounts").update({ last_error: msg }).eq("id", acc.id);
      results.push({ platform: acc.platform, account: acc.account_name ?? "", ok: false, message: msg });
    }
  }

  for (const b of Object.values(byPlatform)) { totals.followers += b.followers; totals.views += b.views; totals.likes += b.likes; totals.comments += b.comments; totals.shares += b.shares; }
  if ((accounts ?? []).length) await db.from("analytics_snapshots").insert({ user_id: userId, ...totals, by_platform: byPlatform });
  return results;
}

/** Hourly background sync: bounded number of users per run, single-flight. */
export async function syncDueUsers(maxUsers = 10) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: locked } = await db.rpc("acquire_job_lock", { _name: "analytics-sync", _seconds: 900 });
  if (!locked) return { skipped: "another sync is running" };
  try {
    const cutoff = new Date(Date.now() - 55 * 60_000).toISOString();
    const { data: accs } = await db.from("social_accounts").select("user_id, last_sync_at").eq("status", "connected").or(`last_sync_at.is.null,last_sync_at.lt.${cutoff}`).limit(200);
    const users = [...new Set((accs ?? []).map((a) => a.user_id))].slice(0, maxUsers);
    for (const u of users) await syncUserAnalytics(u, "auto");
    return { users: users.length };
  } finally {
    await db.rpc("release_job_lock", { _name: "analytics-sync" });
  }
}
