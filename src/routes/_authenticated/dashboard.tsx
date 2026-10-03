import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clapperboard, DollarSign, Eye, Film, Info, OctagonX,
  PackageCheck, RefreshCw, Send, Share2, Sparkles, Users, Workflow,
} from "lucide-react";
import { getCommandCenter } from "@/lib/dashboard.functions";
import { getAnalyticsOverview } from "@/lib/analytics.functions";
import { fmtMoney, fmtNum, rangeFor, timeAgo } from "@/lib/analytics/format";
import { CONNECT_TO_ENABLE, PLATFORM_INFO, REVENUE_UNAVAILABLE, type SocialPlatform } from "@/lib/social/types";
import { StatusBadge } from "@/components/studio/ui";
import { ActivityList } from "@/components/studio/ActivityList";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => pageHead("Command center", "Your whole cartoon studio at a glance: production, publishing, accounts, analytics and earnings."),
  component: Dashboard,
});

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "No time set");
const platformName = (p: string) => PLATFORM_INFO[p as SocialPlatform]?.name ?? (p === "unassigned" ? "No account yet" : p);

function Tip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild><button type="button" aria-label="More info" className="text-muted-foreground hover:text-foreground"><Info className="size-3.5" /></button></TooltipTrigger>
      <TooltipContent className="max-w-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

function Card({ label, value, tip, icon: Icon, to, tone }: { label: string; value: ReactNode; tip: string; icon: typeof Film; to?: string; tone?: "primary" | "success" }) {
  const body = (
    <div className={cn("group h-full rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md", tone === "primary" && "border-primary/30 bg-primary/5")}>
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">{label}<Tip text={tip} /></span>
        <Icon className={cn("size-4", tone === "success" ? "text-success" : "text-primary")} />
      </div>
      <div className="mt-2 font-display text-3xl font-semibold">{value}</div>
    </div>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
}

function Panel({ title, icon: Icon, action, children, className }: { title: string; icon: typeof Film; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5 animate-in fade-in slide-in-from-bottom-2 duration-500", className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Icon className="size-4 text-primary" />{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">{children}</p>;

function Dashboard() {
  const centerFn = useServerFn(getCommandCenter);
  const overviewFn = useServerFn(getAnalyticsOverview);
  const range = useMemo(() => rangeFor("30d", { from: "", to: "" }), []);
  const c = useQuery({ queryKey: ["command-center"], queryFn: () => centerFn(), refetchInterval: 60_000 });
  const a = useQuery({ queryKey: ["analytics", range.from, range.to], queryFn: () => overviewFn({ data: range }) });
  const d = c.data;
  const an = a.data;

  if (c.isError) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
        <h1 className="text-lg font-semibold">The command center couldn't load</h1>
        <p className="mt-1 text-sm text-muted-foreground">{(c.error as Error).message}</p>
        <Button className="mt-4" variant="outline" onClick={() => c.refetch()}><RefreshCw className="size-4" />Try again</Button>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      {/* Greeting + account status */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{greeting()}{d?.name ? `, ${d.name}` : ""}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Here's everything your studio is doing right now.</p>
        </div>
        <Button asChild size="lg"><Link to="/create"><Sparkles className="size-4" />Create video</Link></Button>
      </div>
      {d ? (
        <div className="mb-6 flex flex-wrap gap-2">
          <StatusPill ok={!!d.status.skill} label={d.status.skill ? `Skill: ${d.status.skill.name ?? "SKILL.md"} v${d.status.skill.version}` : "No active skill"} to="/skills" />
          <StatusPill ok={d.status.textAi} label={d.status.textAi ? "Writing AI ready" : "Writing AI not connected"} to="/providers" />
          <StatusPill ok={d.status.videoAi} label={d.status.videoAi ? "Video AI ready" : "Video AI not connected"} to="/providers" />
          <StatusPill ok={d.accounts.some((x) => x.status === "connected")} label={`${d.accounts.filter((x) => x.status === "connected").length} social account(s) connected`} to="/social" />
          {d.status.emergencyStop && <StatusPill ok={false} danger label="Emergency stop is ON — nothing publishes automatically" to="/scheduler" />}
        </div>
      ) : <Skeleton className="mb-6 h-8 w-2/3" />}

      {/* Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {d ? (<>
          <Card label="In production" value={d.cards.inProduction} icon={Clapperboard} to="/projects" tone="primary" tip="Projects currently moving through the production steps." />
          <Card label="Ready" value={d.cards.ready} icon={PackageCheck} to="/calendar" tip="Finished videos waiting for you to publish or schedule them." />
          <Card label="Scheduled" value={d.cards.scheduled} icon={CalendarClock} to="/calendar" tip="Posts waiting for their publishing time, including retries." />
          <Card label="Published today" value={d.cards.publishedToday} icon={Send} tone="success" to="/calendar" tip="Posts confirmed live by the platform today." />
        </>) : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        {an ? (<>
          <Card label="Total views" value={fmtNum(an.totals.views)} icon={Eye} to="/analytics" tip="Views reported by the platforms for videos published in the last 30 days." />
          <Card label="Followers" value={fmtNum(an.totals.followers)} icon={Users} to="/analytics" tip="Latest follower / subscriber counts reported by your connected accounts." />
          <Card label="Available earnings" value={fmtMoney(an.earnings.totalUsd)} icon={DollarSign} to="/analytics" tip="Only amounts the platforms report through their official APIs. Never estimated." />
        </>) : Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>

      {/* Production pipeline */}
      <Panel title="Production pipeline" icon={Workflow} className="mt-6" action={<Link to="/projects" className="text-sm text-primary hover:underline">All projects</Link>}>
        {!d ? <Skeleton className="h-40" /> : d.board.length === 0 ? (
          <Empty>No projects yet. Press <b>Create video</b> to start your first one.</Empty>
        ) : (
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
            {d.columns.map((col) => {
              const items = d.board.filter((p) => p.column === col.key);
              return (
                <div key={col.key} className="w-48 shrink-0 rounded-xl bg-muted/50 p-2">
                  <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {col.label}<span className="rounded-full bg-background px-2 py-0.5">{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.slice(0, 6).map((p) => (
                      <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }}
                        className={cn("block rounded-lg border bg-card p-2.5 text-sm transition-shadow hover:shadow-sm", p.status === "FAILED" && "border-destructive/40")}>
                        <p className="truncate font-medium">{p.title}</p>
                        <Progress value={(p.done / p.total) * 100} className="mt-2 h-1.5" />
                        <div className="mt-1.5 flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
                          <span>{p.done}/{p.total} steps</span>
                          {p.status === "FAILED" ? <span className="text-destructive">Needs attention</span> : null}
                        </div>
                      </Link>
                    ))}
                    {items.length > 6 && <p className="px-1 text-xs text-muted-foreground">+{items.length - 6} more</p>}
                    {items.length === 0 && <p className="px-1 py-3 text-center text-xs text-muted-foreground">Nothing here</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Automation */}
        <Panel title="Automation" icon={RefreshCw} className="lg:col-span-1" action={<Link to="/activity" className="text-sm text-primary hover:underline">All jobs</Link>}>
          {!d ? <Skeleton className="h-40" /> : (
            <div className="space-y-4 text-sm">
              <Row label="Next scheduled post">
                {d.status.emergencyStop ? <span className="text-destructive">Paused by emergency stop</span>
                  : d.automation.nextPost ? <span>{when(d.automation.nextPost.next_attempt_at)} · {platformName(d.automation.nextPost.platform)}</span>
                  : <span className="text-muted-foreground">Nothing scheduled</span>}
              </Row>
              <Row label="Next video generation">
                {!d.automation.videoReady ? <span className="text-muted-foreground">{CONNECT_TO_ENABLE}</span>
                  : d.automation.nextVideo ? <Link to="/projects/$projectId" params={{ projectId: d.automation.nextVideo.id }} className="text-primary hover:underline">{d.automation.nextVideo.title}</Link>
                  : <span className="text-muted-foreground">No project is ready for video yet</span>}
              </Row>
              <div>
                <p className="mb-1.5 font-medium">Retry queue <span className="text-muted-foreground">({d.automation.retryQueue.length})</span></p>
                {d.automation.retryQueue.length ? d.automation.retryQueue.slice(0, 4).map((p) => (
                  <p key={p.id} className="truncate text-xs text-muted-foreground">{platformName(p.platform)} · {p.title} · try {p.attempts + 1}/{p.max_attempts} at {when(p.next_attempt_at)}</p>
                )) : <p className="text-xs text-muted-foreground">Nothing waiting to retry.</p>}
              </div>
              <div>
                <p className="mb-1.5 font-medium">Failed tasks <span className="text-muted-foreground">({d.automation.failedJobs.length + d.automation.failedPosts.length})</span></p>
                {d.automation.failedJobs.length + d.automation.failedPosts.length === 0 ? <p className="text-xs text-muted-foreground">No failures this week.</p> : (
                  <ul className="space-y-1.5">
                    {d.automation.failedPosts.slice(0, 3).map((p) => (
                      <li key={p.id} className="rounded-lg bg-destructive/5 p-2 text-xs"><b>{platformName(p.platform)}</b> · {p.title}<br /><span className="text-muted-foreground">{p.last_error ?? "No reason given"}</span></li>
                    ))}
                    {d.automation.failedJobs.slice(0, 4).map((j) => (
                      <li key={j.id} className={cn("rounded-lg p-2 text-xs", j.status === "blocked" ? "bg-warning/15" : "bg-destructive/5")}>
                        <b>{j.label}</b><br /><span className="text-muted-foreground">{j.error ?? "No reason given"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Panel>

        {/* Content calendar */}
        <Panel title="Upcoming posts" icon={CalendarClock} action={<Link to="/calendar" className="text-sm text-primary hover:underline">Calendar</Link>}>
          {!d ? <Skeleton className="h-40" /> : d.upcoming.length === 0 ? <Empty>No upcoming posts. Finished videos appear here automatically.</Empty> : (
            <ul className="divide-y text-sm">
              {d.upcoming.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.title ?? "Untitled"}</p>
                    <p className="text-xs text-muted-foreground">{platformName(p.platform)} · {p.status === "READY" ? "Waiting for you" : when(p.next_attempt_at ?? p.scheduled_for)}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Social accounts */}
        <Panel title="Social accounts" icon={Share2} action={<Link to="/social" className="text-sm text-primary hover:underline">Manage</Link>}>
          {!d ? <Skeleton className="h-40" /> : d.accounts.length === 0 ? (
            <div className="space-y-2">
              {(["facebook", "youtube", "tiktok"] as const).map((p) => (
                <div key={p} className="flex items-center justify-between rounded-xl border p-3 text-sm">
                  <span className="font-medium">{PLATFORM_INFO[p].name}</span>
                  <span className="text-xs text-muted-foreground">{d.status.platformsReady.includes(p) ? "Ready to connect" : CONNECT_TO_ENABLE}</span>
                </div>
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {d.accounts.map((acc) => <AccountHealth key={acc.id} acc={acc} />)}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Analytics */}
        <Panel title="Performance (30 days)" icon={Eye} className="lg:col-span-2" action={<span className="text-xs text-muted-foreground">{an?.lastSync ? `Synced ${timeAgo(an.lastSync)}` : "Not synced yet"}</span>}>
          {!an ? <Skeleton className="h-56" /> : an.timeline.length < 2 ? (
            <Empty>{an.hasAccounts ? "The chart fills in after a few syncs. Press Sync now on the Analytics page to take the first snapshot." : `No analytics yet. ${CONNECT_TO_ENABLE}`}</Empty>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={an.timeline.map((t) => ({ ...t, label: new Date(t.at).toLocaleDateString() }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" fontSize={11} stroke="var(--muted-foreground)" />
                  <YAxis fontSize={11} stroke="var(--muted-foreground)" width={48} />
                  <ChartTip />
                  <Area type="monotone" dataKey="views" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} name="Views" />
                  <Area type="monotone" dataKey="followers" stroke="var(--success)" fill="var(--success)" fillOpacity={0.1} name="Followers" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        {/* Earnings */}
        <Panel title="Verified earnings" icon={DollarSign} action={<Link to="/analytics" className="text-sm text-primary hover:underline">Details</Link>}>
          {!an ? <Skeleton className="h-40" /> : (
            <ul className="space-y-2 text-sm">
              {an.platforms.map((p) => (
                <li key={p.platform} className="flex items-center justify-between gap-2 rounded-xl border p-3">
                  <span className="font-medium">{PLATFORM_INFO[p.platform].name}</span>
                  {p.earnings != null ? <span className="font-semibold">{fmtMoney(p.earnings)}</span>
                    : <span className="text-right text-xs text-muted-foreground">{p.accounts ? REVENUE_UNAVAILABLE : CONNECT_TO_ENABLE}</span>}
                </li>
              ))}
              <li className="flex items-center justify-between px-1 pt-1 font-semibold"><span>Total (USD)</span><span>{fmtMoney(an.earnings.totalUsd)}</span></li>
              <li className="px-1 text-xs text-muted-foreground">Only platform-reported amounts are counted. Nothing is estimated.</li>
            </ul>
          )}
        </Panel>
      </div>

      {/* Activity log */}
      <Panel title="Activity log" icon={CheckCircle2} className="mt-6" action={<Link to="/activity" className="text-sm text-primary hover:underline">Full history</Link>}>
        {!d ? <Skeleton className="h-40" /> : d.activity.length === 0 ? <Empty>Nothing has happened yet. Every step the studio takes will be listed here.</Empty> : <ActivityList items={d.activity} />}
      </Panel>
    </TooltipProvider>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div><p className="font-medium">{label}</p><div className="mt-0.5 text-xs">{children}</div></div>;
}

function StatusPill({ ok, label, to, danger }: { ok: boolean; label: string; to: string; danger?: boolean }) {
  return (
    <Link to={to} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
      danger ? "border-destructive/40 bg-destructive/10 text-destructive" : ok ? "border-success/30 bg-success/10 text-foreground" : "border-warning/50 bg-warning/15 text-foreground hover:bg-warning/25")}>
      {danger ? <OctagonX className="size-3.5" /> : ok ? <CheckCircle2 className="size-3.5 text-success" /> : <AlertTriangle className="size-3.5" />}
      {label}{!ok && !danger && <ArrowRight className="size-3" />}
    </Link>
  );
}

type Acc = { id: string; platform: string; account_name: string | null; avatar_url: string | null; status: string; token_status: string; token_expires_at: string | null; last_sync_at: string | null; last_error: string | null };
function AccountHealth({ acc }: { acc: Acc }) {
  const expiringSoon = acc.token_expires_at && new Date(acc.token_expires_at).getTime() < Date.now() + 3 * 86400_000 && acc.token_status === "valid";
  const bad = acc.token_status === "expired" || acc.token_status === "invalid" || acc.status !== "connected";
  const health = bad ? { label: "Reconnect needed", cls: "bg-destructive/10 text-destructive" } : acc.last_error ? { label: "Warning", cls: "bg-warning/20" } : expiringSoon ? { label: "Renews soon", cls: "bg-warning/20" } : { label: "Healthy", cls: "bg-success/15 text-success" };
  return (
    <li className="flex items-center gap-3 rounded-xl border p-3 text-sm">
      {acc.avatar_url ? <img src={acc.avatar_url} alt="" className="size-8 rounded-full object-cover" /> : <div className="size-8 rounded-full bg-muted" />}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{acc.account_name ?? "Account"}</p>
        <p className="text-xs text-muted-foreground">{platformName(acc.platform)} · {acc.last_sync_at ? `synced ${timeAgo(acc.last_sync_at)}` : "never synced"}</p>
      </div>
      <span title={acc.last_error ?? undefined} className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", health.cls)}>{health.label}</span>
    </li>
  );
}
