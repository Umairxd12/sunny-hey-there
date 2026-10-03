import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarCheck, Clock, DollarSign, Eye, Film, Heart, MessageCircle, RefreshCw, Send, Share2, Users, XCircle, Zap } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState, PageHeader, StatCard } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pageHead } from "@/lib/seo";
import { getAnalyticsOverview, syncAnalyticsNow } from "@/lib/analytics.functions";
import { PLATFORM_INFO, REVENUE_UNAVAILABLE, type SocialPlatform } from "@/lib/social/types";
import { fmtMoney, fmtNum, fmtPct, rangeFor, timeAgo, type Preset } from "@/lib/analytics/format";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => pageHead("Analytics & Earnings", "Views, engagement, followers and verified earnings across Facebook, YouTube and TikTok."),
  component: AnalyticsPage,
});

const PRESETS: [Preset, string][] = [["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["month", "This month"], ["last_month", "Last month"], ["custom", "Custom"]];

function AnalyticsPage() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getAnalyticsOverview);
  const syncFn = useServerFn(syncAnalyticsNow);
  const [preset, setPreset] = useState<Preset>("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [syncing, setSyncing] = useState(false);
  const r = useMemo(() => rangeFor(preset, custom), [preset, custom]);
  const q = useQuery({ queryKey: ["analytics", r.from, r.to], queryFn: () => overviewFn({ data: r }), refetchInterval: 60_000 });
  const d = q.data;

  async function sync() {
    setSyncing(true);
    const res = await syncFn();
    setSyncing(false);
    if (!res.ok) { toast.error(res.error); return; }
    const failed = res.results.filter((x) => !x.ok);
    if (!res.results.length) toast.message("No connected accounts to sync.");
    else if (failed.length) toast.error(`Sync failed for ${failed.map((f) => `${PLATFORM_INFO[f.platform as SocialPlatform]?.name} (${f.account})`).join(", ")}`);
    else toast.success("Analytics synced");
    qc.invalidateQueries({ queryKey: ["analytics"] });
  }

  return (
    <>
      <PageHeader
        title="Analytics & earnings"
        description="Every connected account in one place. Numbers come straight from each platform — nothing is estimated."
        action={
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-sm text-muted-foreground"><Clock className="size-4" />Last synced: {d?.lastSync ? timeAgo(d.lastSync) : "never"}</span>
            <Button onClick={sync} disabled={syncing}><RefreshCw className={syncing ? "size-4 animate-spin" : "size-4"} />{syncing ? "Syncing…" : "Sync now"}</Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {PRESETS.map(([k, l]) => <Button key={k} size="sm" variant={preset === k ? "default" : "outline"} onClick={() => setPreset(k)}>{l}</Button>)}
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="w-40" />
            <span className="text-sm text-muted-foreground">to</span>
            <Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="w-40" />
          </div>
        )}
      </div>

      {d?.syncErrors.length ? (
        <div className="mb-6 space-y-2 rounded-2xl border border-destructive/50 bg-destructive/10 p-4">
          {d.syncErrors.map((e, i) => (
            <p key={i} className="flex items-start gap-2 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span><b>{PLATFORM_INFO[e.platform as SocialPlatform]?.name ?? e.platform}{e.account ? ` · ${e.account}` : ""}</b> — {e.status === "failed" ? "sync failed" : "partly synced"}: {e.message}</span></p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total videos" value={fmtNum(d?.counts.totalVideos)} icon={Film} />
        <StatCard label="Published" value={fmtNum(d?.counts.published)} hint="In this period" icon={Send} />
        <StatCard label="Scheduled" value={fmtNum(d?.counts.scheduled)} icon={CalendarCheck} />
        <StatCard label="Failed posts" value={fmtNum(d?.counts.failed)} icon={XCircle} />
        <StatCard label="Views" value={fmtNum(d?.totals.views)} hint="Videos published in this period" icon={Eye} />
        <StatCard label="Likes" value={fmtNum(d?.totals.likes)} icon={Heart} />
        <StatCard label="Comments" value={fmtNum(d?.totals.comments)} icon={MessageCircle} />
        <StatCard label="Shares" value={fmtNum(d?.totals.shares)} icon={Share2} />
        <StatCard label="Followers / subscribers" value={fmtNum(d?.totals.followers)} hint="Latest count" icon={Users} />
        <StatCard label="Watch time" value={d?.totals.watchTimeMinutes != null ? `${fmtNum(Math.round(d.totals.watchTimeMinutes / 60))} h` : "—"} hint={d?.totals.watchTimeMinutes == null ? "Not available from connected accounts" : undefined} icon={Clock} />
        <StatCard label="Engagement" value={fmtPct(d?.totals.engagement)} hint="(likes + comments + shares) ÷ views" icon={Zap} />
        <StatCard label="Verified earnings" value={fmtMoney(d?.earnings.totalUsd)} hint={d?.earnings.totalUsd == null ? "No revenue data from connected APIs" : "USD, from platform reports"} icon={DollarSign} />
      </div>

      {!q.isLoading && !d?.hasAccounts ? (
        <div className="mt-8"><EmptyState icon={Users} title="No connected accounts" description="Connect Facebook, YouTube or TikTok to start collecting analytics." action={<Button asChild><Link to="/social">Connect accounts</Link></Button>} /></div>
      ) : null}

      <section className="mt-8 rounded-2xl border bg-card p-6">
        <h2 className="text-lg font-semibold">Growth over time</h2>
        {d?.timeline.length ? (
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.timeline.map((t) => ({ ...t, label: new Date(t.at).toLocaleDateString() }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis fontSize={12} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Area type="monotone" dataKey="views" name="Views" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} />
                <Area type="monotone" dataKey="followers" name="Followers" stroke="var(--success)" fill="var(--success)" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="mt-2 text-sm text-muted-foreground">The chart fills in as syncs collect history (every hour, or when you press Sync now).</p>}
      </section>

      <h2 className="mt-10 mb-3 text-lg font-semibold">Platforms</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {(d?.platforms ?? []).map((p) => (
          <div key={p.platform} className="rounded-2xl border bg-card p-5">
            <div className="flex items-center justify-between"><h3 className="font-semibold">{PLATFORM_INFO[p.platform].name}</h3><span className="text-xs text-muted-foreground">{p.accounts} account{p.accounts === 1 ? "" : "s"}</span></div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Metric k="Followers" v={fmtNum(p.followers)} /><Metric k="Published" v={fmtNum(p.published)} />
              <Metric k="Views" v={fmtNum(p.views)} /><Metric k="Engagement" v={fmtPct(p.engagement)} />
              <Metric k="Likes" v={fmtNum(p.likes)} /><Metric k="Comments" v={fmtNum(p.comments)} />
            </dl>
            <p className="mt-4 border-t pt-3 text-sm"><span className="text-muted-foreground">Earnings: </span>{p.earnings != null ? fmtMoney(p.earnings) : <span className="text-muted-foreground">{REVENUE_UNAVAILABLE}</span>}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 mb-3 text-lg font-semibold">Accounts</h2>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Platform</TableHead><TableHead>Followers</TableHead><TableHead>Views</TableHead><TableHead>Engagement</TableHead><TableHead>Published</TableHead><TableHead>Recent posts</TableHead><TableHead>Latest activity</TableHead><TableHead>Earnings</TableHead></TableRow></TableHeader>
          <TableBody>
            {(d?.accounts ?? []).length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">No connected accounts.</TableCell></TableRow>}
            {(d?.accounts ?? []).map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.account_name}</TableCell>
                <TableCell>{PLATFORM_INFO[a.platform as SocialPlatform]?.name}</TableCell>
                <TableCell>{fmtNum(a.followers)}</TableCell><TableCell>{fmtNum(a.views)}</TableCell><TableCell>{fmtPct(a.engagement)}</TableCell><TableCell>{a.publishedCount}</TableCell>
                <TableCell className="max-w-48 text-xs">{a.recent.length ? a.recent.map((r) => <Link key={r.id} to="/analytics/$postId" params={{ postId: r.id }} className="block truncate text-primary hover:underline">{r.title}</Link>) : "—"}</TableCell>
                <TableCell className="text-xs">{a.latestActivity ? timeAgo(a.latestActivity) : "—"}</TableCell>
                <TableCell className="max-w-56 text-xs">{a.earnings != null ? fmtMoney(a.earnings) : <span className="text-muted-foreground">{a.earningsNote}</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <h2 className="mt-10 mb-3 text-lg font-semibold">Video performance</h2>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Video</TableHead><TableHead>Platform</TableHead><TableHead>Published</TableHead><TableHead>Views</TableHead><TableHead>Likes</TableHead><TableHead>Comments</TableHead><TableHead>Shares</TableHead><TableHead>Watch time</TableHead><TableHead>Engagement</TableHead><TableHead>Revenue</TableHead><TableHead>Link</TableHead></TableRow></TableHeader>
          <TableBody>
            {(d?.videos ?? []).length === 0 && <TableRow><TableCell colSpan={11} className="text-center text-sm text-muted-foreground">No videos published in this period.</TableCell></TableRow>}
            {(d?.videos ?? []).map((v) => (
              <TableRow key={v.id}>
                <TableCell>
                  <Link to="/analytics/$postId" params={{ postId: v.id }} className="flex items-center gap-3 hover:text-primary">
                    {v.thumbnail ? <img src={v.thumbnail} alt="" className="h-10 w-16 rounded object-cover" /> : <div className="grid h-10 w-16 place-items-center rounded bg-muted"><Film className="size-4 text-muted-foreground" /></div>}
                    <span className="max-w-48 truncate font-medium">{v.title}</span>
                  </Link>
                </TableCell>
                <TableCell>{PLATFORM_INFO[v.platform as SocialPlatform]?.name}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{v.published_at ? new Date(v.published_at).toLocaleDateString() : "—"}</TableCell>
                <TableCell>{fmtNum(v.metrics?.views)}</TableCell><TableCell>{fmtNum(v.metrics?.likes)}</TableCell><TableCell>{fmtNum(v.metrics?.comments)}</TableCell><TableCell>{fmtNum(v.metrics?.shares)}</TableCell>
                <TableCell>{v.metrics?.watch_time_minutes != null ? `${fmtNum(Math.round(v.metrics.watch_time_minutes))} min` : "—"}</TableCell>
                <TableCell>{fmtPct(v.engagement)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{v.revenue != null ? fmtMoney(v.revenue) : "Unavailable"}</TableCell>
                <TableCell>{v.published_url ? <a href={v.published_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Open</a> : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <h2 className="mt-10 mb-3 text-lg font-semibold">Earnings</h2>
      <section className="rounded-2xl border bg-card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-muted-foreground">Total verified earnings (USD) in this period</p>
          <p className="font-display text-3xl font-semibold">{fmtMoney(d?.earnings.totalUsd)}</p>
        </div>
        <ul className="mt-4 divide-y text-sm">
          {(d?.platforms ?? []).map((p) => (
            <li key={p.platform} className="flex items-center justify-between py-3"><span className="font-medium">{PLATFORM_INFO[p.platform].name}</span>
              <span className={p.earnings == null ? "text-muted-foreground" : ""}>{p.earnings != null ? fmtMoney(p.earnings) : REVENUE_UNAVAILABLE}</span></li>
          ))}
        </ul>
        {d?.earnings.otherCurrency.length ? <p className="mt-3 text-xs text-muted-foreground">Some earnings were reported in other currencies and are not added to the USD total: {d.earnings.otherCurrency.map((e) => `${e.amount.toFixed(2)} ${e.currency}`).join(", ")}.</p> : null}
        <p className="mt-4 text-xs text-muted-foreground">Only amounts reported by the platforms are counted — nothing is estimated. Currency conversion is off because no exchange-rate service is connected; everything is shown in USD.</p>
      </section>
    </>
  );
}

function Metric({ k, v }: { k: string; v: string }) {
  return <div><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-semibold">{v}</dd></div>;
}
