import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ExternalLink, Film } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader, StatCard, StatusBadge } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { Clock, Eye, Heart, MessageCircle, Share2, Zap, DollarSign, Timer } from "lucide-react";
import { pageHead } from "@/lib/seo";
import { getVideoAnalytics } from "@/lib/analytics.functions";
import { PLATFORM_INFO, REVENUE_UNAVAILABLE, type SocialPlatform } from "@/lib/social/types";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/analytics/format";

export const Route = createFileRoute("/_authenticated/analytics/$postId")({
  head: () => pageHead("Video analytics", "Detailed performance for one published video."),
  component: VideoAnalyticsPage,
});

function VideoAnalyticsPage() {
  const { postId } = Route.useParams();
  const fn = useServerFn(getVideoAnalytics);
  const q = useQuery({ queryKey: ["video-analytics", postId], queryFn: () => fn({ data: { postId } }) });
  const d = q.data;
  if (q.isLoading) return <PageHeader title="Video analytics" description="Loading…" />;
  if (!d) return <PageHeader title="Video not found" action={<Button asChild variant="outline"><Link to="/analytics"><ArrowLeft className="size-4" />Back</Link></Button>} />;

  const last = d.timeline.at(-1);
  const eng = last?.views ? ((last.likes ?? 0) + (last.comments ?? 0) + (last.shares ?? 0)) / last.views : null;
  const p = d.post;

  return (
    <>
      <PageHeader title={p.title ?? "Video"} description={`${PLATFORM_INFO[p.platform as SocialPlatform]?.name ?? p.platform}${d.account ? ` · ${d.account.account_name}` : ""}`}
        action={<Button asChild variant="outline"><Link to="/analytics"><ArrowLeft className="size-4" />All analytics</Link></Button>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border bg-card p-5">
          {d.thumbnail ? <img src={d.thumbnail} alt="" className="aspect-video w-full rounded-xl object-cover" /> : <div className="grid aspect-video place-items-center rounded-xl bg-muted"><Film className="size-8 text-muted-foreground" /></div>}
          <h2 className="mt-4 font-semibold">Publication details</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Status</dt><dd><StatusBadge status={p.status} /></dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Published</dt><dd>{p.published_at ? new Date(p.published_at).toLocaleString() : "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Platform ID</dt><dd className="max-w-40 truncate font-mono text-xs">{p.external_post_id ?? "—"}</dd></div>
          </dl>
          {p.caption && <p className="mt-3 line-clamp-4 text-sm text-muted-foreground">{p.caption}</p>}
          {p.published_url && <Button asChild className="mt-4 w-full" variant="outline"><a href={p.published_url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />Open video</a></Button>}
        </section>
        <div className="space-y-6 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Views" value={fmtNum(last?.views)} icon={Eye} />
            <StatCard label="Likes" value={fmtNum(last?.likes)} icon={Heart} />
            <StatCard label="Comments" value={fmtNum(last?.comments)} icon={MessageCircle} />
            <StatCard label="Shares" value={fmtNum(last?.shares)} icon={Share2} />
            <StatCard label="Engagement" value={fmtPct(eng)} icon={Zap} />
            <StatCard label="Watch time" value={last?.watch != null ? `${fmtNum(Math.round(last.watch))} min` : "—"} hint={last?.watch == null ? "Not provided by this platform connection" : undefined} icon={Clock} />
            <StatCard label="Avg. view" value={last?.avg != null ? `${last.avg.toFixed(1)} s` : "—"} icon={Timer} />
            <StatCard label="Revenue" value={fmtMoney(d.revenue)} hint={d.revenue == null ? REVENUE_UNAVAILABLE : "USD"} icon={DollarSign} />
          </div>
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Performance timeline</h2>
            {d.timeline.length > 0 ? (
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={d.timeline.map((t) => ({ ...t, label: new Date(t.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric" }) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" fontSize={12} stroke="var(--muted-foreground)" />
                    <YAxis fontSize={12} stroke="var(--muted-foreground)" />
                    <Tooltip /><Legend />
                    <Line type="monotone" dataKey="views" name="Views" stroke="var(--primary)" dot={false} />
                    <Line type="monotone" dataKey="likes" name="Likes" stroke="var(--success)" dot={false} />
                    <Line type="monotone" dataKey="comments" name="Comments" stroke="var(--muted-foreground)" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="mt-2 text-sm text-muted-foreground">No measurements yet. They are collected every hour after publishing.</p>}
          </section>
          <section className="rounded-2xl border bg-card p-6 text-sm">
            <h2 className="text-lg font-semibold">Audience</h2>
            <p className="mt-2 text-muted-foreground">Audience breakdowns (age, country, traffic source) aren't available through the current connections. Reported metrics are shown above.</p>
          </section>
        </div>
      </div>
    </>
  );
}
