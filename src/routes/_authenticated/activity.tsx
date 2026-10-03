import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ListChecks, RefreshCw } from "lucide-react";
import { listJobs } from "@/lib/dashboard.functions";
import { EmptyState, PageHeader } from "@/components/studio/ui";
import { ActivityList } from "@/components/studio/ActivityList";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => pageHead("Activity & jobs", "Every step the automation took: job status, timing, errors, retries and provider responses."),
  component: ActivityPage,
});

const FILTERS = ["all", "running", "succeeded", "failed", "blocked", "retrying", "skipped"] as const;
const JOB_STYLE: Record<string, string> = {
  succeeded: "bg-success/15 text-success", failed: "bg-destructive/15 text-destructive", blocked: "bg-warning/20",
  retrying: "bg-warning/20", running: "bg-primary/15 text-primary", skipped: "bg-muted text-muted-foreground", queued: "bg-muted",
};
const JOB_LABEL: Record<string, string> = { blocked: "Needs connection" };
const dt = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");
const dur = (a: string, b: string | null) => (b ? `${Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000))}s` : "—");

function ActivityPage() {
  const fn = useServerFn(listJobs);
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("all");
  const q = useQuery({ queryKey: ["jobs", status], queryFn: () => fn({ data: { status } }), refetchInterval: 30_000 });
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="Activity & jobs" description="A full record of what the studio did — nothing fails silently."
        action={<Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}><RefreshCw className={cn("size-4", q.isFetching && "animate-spin")} />Refresh</Button>} />
      {q.isError && <p className="mb-4 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">Couldn't load: {(q.error as Error).message}</p>}
      <Tabs defaultValue="activity">
        <TabsList><TabsTrigger value="activity">Activity log</TabsTrigger><TabsTrigger value="jobs">Jobs</TabsTrigger></TabsList>
        <TabsContent value="activity" className="mt-4">
          <div className="rounded-2xl border bg-card p-5">
            {q.isLoading ? <Skeleton className="h-60" /> : q.data?.activity.length ? <ActivityList items={q.data.activity} />
              : <EmptyState icon={ListChecks} title="No activity yet" description="Production steps, publishing, syncs and account changes will be listed here." />}
          </div>
        </TabsContent>
        <TabsContent value="jobs" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Button key={f} size="sm" variant={status === f ? "default" : "outline"} onClick={() => setStatus(f)} className="capitalize">{f === "blocked" ? "Needs connection" : f}</Button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-2xl border bg-card">
            {q.isLoading ? <Skeleton className="m-4 h-40" /> : !q.data?.jobs.length ? (
              <p className="p-6 text-sm text-muted-foreground">No jobs with this status.</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Job</TableHead><TableHead>Status</TableHead><TableHead>Started</TableHead><TableHead>Completed</TableHead>
                  <TableHead>Took</TableHead><TableHead>Retries</TableHead><TableHead>Error</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {q.data.jobs.map((j) => (<>
                    <TableRow key={j.id}>
                      <TableCell className="max-w-64"><p className="truncate font-medium">{j.label}</p><p className="font-mono text-[11px] text-muted-foreground">{j.id.slice(0, 8)} · {j.kind}{j.provider ? ` · ${j.provider}` : ""}</p></TableCell>
                      <TableCell><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", JOB_STYLE[j.status])}>{JOB_LABEL[j.status] ?? j.status}</span></TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{dt(j.started_at)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{dt(j.completed_at)}</TableCell>
                      <TableCell className="text-xs">{dur(j.started_at, j.completed_at)}</TableCell>
                      <TableCell className="text-xs">{j.retry_count}</TableCell>
                      <TableCell className="max-w-72 text-xs text-destructive"><p className="line-clamp-2">{j.error ?? ""}</p></TableCell>
                      <TableCell><Button size="sm" variant="ghost" onClick={() => setOpen(open === j.id ? null : j.id)}>{open === j.id ? "Hide" : "Details"}</Button></TableCell>
                    </TableRow>
                    {open === j.id && (
                      <TableRow key={j.id + "-d"}>
                        <TableCell colSpan={8} className="bg-muted/40">
                          <div className="grid gap-3 text-xs md:grid-cols-2">
                            <div><p className="mb-1 font-semibold">Result</p><pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-card p-3">{j.result ? JSON.stringify(j.result, null, 2) : "—"}</pre></div>
                            <div><p className="mb-1 font-semibold">Provider response</p><pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-card p-3">{j.provider_response ? JSON.stringify(j.provider_response, null, 2) : "—"}</pre></div>
                            {j.error && <div className="md:col-span-2"><p className="mb-1 font-semibold">Full error</p><p className="whitespace-pre-wrap rounded-lg bg-card p-3 text-destructive">{j.error}</p></div>}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
