import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, ExternalLink } from "lucide-react";
import { EmptyState, PageHeader, StatusBadge } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pageHead } from "@/lib/seo";
import { getAutomation, listCalendar, retryPost, schedulePost, unschedulePost } from "@/lib/automation.functions";
import { POST_STATUSES, formatInZone, zonedTimeToUtc } from "@/lib/automation/schedule";
import { PLATFORM_INFO, type SocialPlatform } from "@/lib/social/types";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => pageHead("Content Calendar", "Every planned, publishing and published post with its status."),
  component: CalendarPage,
});

function CalendarPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCalendar);
  const autoFn = useServerFn(getAutomation);
  const scheduleFn = useServerFn(schedulePost);
  const unscheduleFn = useServerFn(unschedulePost);
  const retryFn = useServerFn(retryPost);
  const q = useQuery({ queryKey: ["calendar"], queryFn: () => listFn(), refetchInterval: 30_000 });
  const auto = useQuery({ queryKey: ["automation"], queryFn: () => autoFn() });
  const [filter, setFilter] = useState<string>("ALL");
  const [editing, setEditing] = useState<{ id: string; accountId: string; at: string } | null>(null);
  const tz = auto.data?.settings.timezone ?? "America/New_York";
  const refresh = () => qc.invalidateQueries({ queryKey: ["calendar"] });

  const groups = useMemo(() => {
    const posts = (q.data?.posts ?? []).filter((p) => filter === "ALL" || p.status === filter);
    const map = new Map<string, typeof posts>();
    for (const p of posts) {
      const when = p.published_at ?? p.scheduled_for;
      const key = when ? formatInZone(when, tz, "date") : "Not scheduled yet";
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()];
  }, [q.data, filter, tz]);

  const name = (id: string | null, list: { id: string; [k: string]: unknown }[] | undefined, field: string) => (id ? (list?.find((x) => x.id === id)?.[field] as string | undefined) : undefined);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    const r = await fn();
    if (!r.ok) { toast.error(r.error ?? "Something went wrong"); return; }
    toast.success(ok); refresh();
  }

  async function saveSchedule() {
    if (!editing) return;
    const m = editing.at.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!m || !editing.accountId) { toast.error("Pick an account and a time."); return; }
    const at = zonedTimeToUtc(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, tz).toISOString();
    await run(() => scheduleFn({ data: { postId: editing.id, accountId: editing.accountId, at } }), "Post scheduled");
    setEditing(null);
  }

  const posts = q.data?.posts ?? [];
  return (
    <>
      <PageHeader
        title="Content calendar"
        description={`Everything planned and published. Times shown in ${tz.replace(/_/g, " ")}.`}
        action={
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="ALL">All statuses</SelectItem>{POST_STATUSES.map((s) => <SelectItem key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</SelectItem>)}</SelectContent>
          </Select>
        }
      />
      {auto.data?.settings.emergency_stop && (
        <div className="mb-6 rounded-xl border border-destructive bg-destructive/10 p-4 text-sm">Emergency stop is on — nothing will be published automatically. <Link to="/scheduler" className="underline">Manage in Scheduler</Link></div>
      )}
      {!q.isLoading && posts.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Nothing planned yet" description="When a video finishes Final QA it appears here as Ready — or Scheduled if auto-publish is on for that project." action={<Button asChild><Link to="/create">Create a video</Link></Button>} />
      ) : (
        <div className="space-y-8">
          {groups.map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{day}</h2>
              <div className="overflow-x-auto rounded-2xl border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Time</TableHead><TableHead>Video</TableHead><TableHead>Platform</TableHead><TableHead>Account</TableHead><TableHead className="min-w-56">Caption</TableHead><TableHead>Hashtags</TableHead><TableHead>Status</TableHead><TableHead /></TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap">{formatInZone(p.published_at ?? p.scheduled_for, tz, "time")}</TableCell>
                        <TableCell className="max-w-40 truncate">{name(p.project_id, q.data?.projects, "title") ?? p.title ?? "—"}</TableCell>
                        <TableCell>{PLATFORM_INFO[p.platform as SocialPlatform]?.name ?? "Not chosen"}</TableCell>
                        <TableCell className="max-w-36 truncate">{name(p.social_account_id, q.data?.accounts, "account_name") ?? "—"}</TableCell>
                        <TableCell className="max-w-64"><p className="line-clamp-2 text-sm">{p.caption || <span className="text-muted-foreground">Written for your audience at publish time</span>}</p></TableCell>
                        <TableCell className="max-w-40"><p className="line-clamp-2 text-xs text-muted-foreground">{p.hashtags ? p.hashtags.split(/\s+/).map((h) => `#${h.replace(/^#/, "")}`).join(" ") : "—"}</p></TableCell>
                        <TableCell>
                          <StatusBadge status={p.status} />
                          {p.status === "RETRYING" && <p className="mt-1 text-xs text-muted-foreground">Attempt {p.attempts + 1} of {p.max_attempts}</p>}
                          {p.last_error && (p.status === "FAILED" || p.status === "RETRYING") && <p className="mt-1 max-w-56 text-xs text-destructive">{PLATFORM_INFO[p.platform as SocialPlatform]?.name ?? "Publishing"}: {p.last_error}</p>}
                          {p.status_detail && p.status !== "PUBLISHED" && <p className="mt-1 max-w-56 text-xs text-muted-foreground">{p.status_detail}</p>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {p.published_url && <Button asChild size="sm" variant="ghost"><a href={p.published_url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> View</a></Button>}
                          {["DRAFT", "READY", "SCHEDULED"].includes(p.status) && !p.external_post_id && (
                            <Button size="sm" variant="outline" onClick={() => setEditing({ id: p.id, accountId: p.social_account_id ?? "", at: "" })}>{p.status === "SCHEDULED" ? "Reschedule" : "Schedule"}</Button>
                          )}
                          {(p.status === "SCHEDULED" || p.status === "RETRYING") && <Button size="sm" variant="ghost" onClick={() => run(() => unscheduleFn({ data: { postId: p.id } }), "Moved back to Ready")}>Unschedule</Button>}
                          {p.status === "FAILED" && !p.external_post_id && <Button size="sm" variant="outline" onClick={() => run(() => retryFn({ data: { postId: p.id } }), "Retry queued")}>Retry</Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule post</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={editing?.accountId ?? ""} onValueChange={(v) => editing && setEditing({ ...editing, accountId: v })}>
              <SelectTrigger><SelectValue placeholder="Choose an account" /></SelectTrigger>
              <SelectContent>
                {(q.data?.accounts ?? []).filter((a) => a.status === "connected").map((a) => <SelectItem key={a.id} value={a.id}>{PLATFORM_INFO[a.platform as SocialPlatform]?.name} · {a.account_name}</SelectItem>)}
              </SelectContent>
            </Select>
            {(q.data?.accounts ?? []).every((a) => a.status !== "connected") && <p className="text-sm text-muted-foreground">No connected accounts. <Link to="/social" className="text-primary underline">Connect one first.</Link></p>}
            <div>
              <Input type="datetime-local" value={editing?.at ?? ""} onChange={(e) => editing && setEditing({ ...editing, at: e.target.value })} />
              <p className="mt-1 text-xs text-muted-foreground">Time in {tz.replace(/_/g, " ")}</p>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={saveSchedule}>Schedule</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
