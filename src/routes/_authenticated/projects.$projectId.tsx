import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronDown, Loader2, Lock, Play, RotateCcw, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LOCKED_STAGES, STAGES, nextRunnableIndex } from "@/lib/pipeline";
import { delegateFullPipeline, delegateVideoToWorker, runPipelineStep } from "@/lib/pipeline.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  validateSearch: (search: Record<string, unknown>): { autostart?: "1" } =>
    search["autostart"] === "1" ? { autostart: "1" } : {},
  head: () => pageHead("Production", "Step-by-step production pipeline for a video."),
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { autostart } = Route.useSearch();
  const qc = useQueryClient();
  const run = useServerFn(runPipelineStep);
  const delegate = useServerFn(delegateVideoToWorker);
  const delegateFull = useServerFn(delegateFullPipeline);
  const [running, setRunning] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const autoStarted = useRef(false);

  const { data } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const [p, s] = await Promise.all([
        supabase.from("projects").select("*").eq("id", projectId).single(),
        supabase.from("pipeline_steps").select("*").eq("project_id", projectId),
      ]);
      return { project: p.data, steps: s.data ?? [] };
    },
  });

  if (!data?.project) return <p className="text-muted-foreground">Loading…</p>;
  const { project, steps } = data;
  const stepOf = (k: string) => steps.find((s) => s.step_key === k);
  const isDone = (k: string) => stepOf(k)?.status === "done";
  const nextIdx = nextRunnableIndex(isDone);
  const doneCount = STAGES.filter((s) => isDone(s.key)).length;

  async function runStep(key: string) {
    setRunning(key);
    try {
      const res = await run({ data: { projectId, stepKey: key } });
      if (!res.ok) toast.error(res.error); else toast.success("Stage finished");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setRunning(null);
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    }
  }

  /** Manual path: delegate only the video stage to the studio worker. */
  async function delegateVideo() {
    setRunning("generate_video");
    try {
      const res = await delegate({ data: { projectId } });
      if (!res.ok) toast.error(res.error);
      else toast.success("Video queued — the worker is generating it now.");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setRunning(null);
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    }
  }

  /** One click: hands the whole production to TechGenie — script, storyboard,
   *  characters and video are all made by the studio agent through its API.
   *  The website becomes the review + approve/reject + auto-publish front-end. */
  async function runAll() {
    if (runningAll || running) return;
    setRunningAll(true);
    try {
      const res = await delegateFull({ data: { projectId } });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("TechGenie is making your video — script, storyboard, characters, everything. It will appear in Videos when ready.");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setRunningAll(false);
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    }
  }

  useEffect(() => {
    if (autostart && !autoStarted.current && data?.project) {
      autoStarted.current = true;
      runAll();
    }
  }, [autostart, data?.project]);

  return (
    <>
      <PageHeader title={project.title} description={project.idea}
        action={<div className="flex gap-2"><Button asChild><Link to="/workspace/$projectId" params={{ projectId }}>Open video workspace</Link></Button><Button variant="outline" asChild><Link to="/projects">All projects</Link></Button></div>} />
      <div className="mb-6 rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2 font-medium">Current status <StatusBadge status={project.status} /></span>
          <span className="text-muted-foreground">{doneCount} of {STAGES.length} stages done</span>
        </div>
        {(() => {
          const full = stepOf("full_pipeline")?.status;
          if (full === "queued" || full === "running") {
            return (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-primary/10 p-4 ring-1 ring-primary/30">
                <Loader2 className="size-5 animate-spin text-primary" />
                <p className="text-sm"><span className="font-semibold">TechGenie is making your video</span> — script, storyboard, characters and video, all through the studio API. You can close this page; the finished video will appear in Videos for your review.</p>
              </div>
            );
          }
          return doneCount < STAGES.length ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-secondary/60 p-4">
              <Button size="lg" disabled={runningAll || !!running} onClick={runAll}>
                {runningAll ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                {runningAll ? "Starting…" : "Generate video — 1 click"}
              </Button>
              <p className="max-w-md text-xs text-muted-foreground">One click hands the whole production to TechGenie: script, storyboard, locked characters and the video itself, all made through the studio API exactly as your active skill defines. You review the finished video, then approve or reject it.</p>
            </div>
          ) : null;
        })()}
        <Progress className="mt-3" value={(doneCount / STAGES.length) * 100} />
        <p className="mt-3 text-sm">
          {doneCount === STAGES.length ? "Your video is finished." : <>Your video is now at <span className="font-semibold">Step {nextIdx + 1} · {STAGES[nextIdx]?.label}</span></>}
        </p>
        {project.last_error && (
          <p className="mt-3 flex items-start gap-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{project.last_error}</p>
        )}
        <ol className="mt-5 flex gap-1 overflow-x-auto pb-1" aria-label="Production timeline">
          {STAGES.map((def, i) => {
            const s = running === def.key ? "running" : stepOf(def.key)?.status ?? "pending";
            const dot = s === "done" ? "bg-primary text-primary-foreground" : s === "running" || s === "queued" ? "bg-primary/20 text-primary ring-2 ring-primary" : s === "failed" ? "bg-destructive text-destructive-foreground" : s === "blocked" ? "bg-accent text-accent-foreground ring-2 ring-border" : i === nextIdx ? "bg-secondary ring-2 ring-primary" : "bg-secondary text-muted-foreground";
            return (
              <li key={def.key} className="flex min-w-[76px] flex-1 flex-col items-center gap-1.5 text-center">
                <div className="flex w-full items-center">
                  <span className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : isDone(STAGES[i - 1]!.key) ? "bg-primary" : "bg-border"}`} />
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${dot}`}>
                    {s === "done" ? <Check className="size-3.5" /> : s === "running" ? <Loader2 className="size-3.5 animate-spin" /> : i + 1}
                  </span>
                  <span className={`h-0.5 flex-1 ${i === STAGES.length - 1 ? "opacity-0" : isDone(def.key) ? "bg-primary" : "bg-border"}`} />
                </div>
                <span className={`text-[11px] leading-tight ${i === nextIdx ? "font-semibold" : "text-muted-foreground"}`}>{def.label}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <ol className="space-y-3">
        {STAGES.map((def, i) => {
          const st = stepOf(def.key);
          const status = running === def.key ? "running" : st?.status ?? "pending";
          const canRun = i <= nextIdx && !running;
          const isText = def.capability === "text";
          return (
            <li key={def.key} className={`rounded-2xl border bg-card ${i === nextIdx ? "border-primary/50" : ""}`}>
              <Collapsible>
                <div className="flex flex-wrap items-center gap-4 p-5">
                  <div className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary font-display text-sm font-semibold">{i + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{def.label}</h3><StatusBadge status={status} />
                      {LOCKED_STAGES.has(def.key) && st?.status === "done" && <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"><Lock className="size-3" />Locked</span>}
                      {!isText && <span className="text-xs text-muted-foreground">Needs a video provider</span>}</div>
                    <p className="text-sm text-muted-foreground">{def.description}</p>
                    {st?.error && <p className="mt-1 text-sm text-destructive">{st.error}</p>}
                  </div>
                  {st?.status === "blocked" ? (
                    <span className="flex gap-2">
                      <Button size="sm" variant="outline" asChild><Link to="/providers">Connect provider</Link></Button>
                      {def.key === "generate_video" && (
                        <Button size="sm" variant="outline" disabled={!!running} onClick={delegateVideo}>
                          {running === "generate_video" ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}Use studio worker
                        </Button>
                      )}
                    </span>
                  ) : st?.status === "queued" ? (
                    <Button size="sm" variant="outline" disabled><Loader2 className="size-4 animate-spin" />Queued — worker is generating</Button>
                  ) : (
                    <Button size="sm" variant={st?.status === "done" ? "outline" : "default"} disabled={!canRun} onClick={() => runStep(def.key)}>
                      {running === def.key ? <Loader2 className="size-4 animate-spin" /> : st?.status === "done" ? <RotateCcw className="size-4" /> : <Play className="size-4" />}
                      {running === def.key ? "Working…" : st?.status === "done" ? "Redo" : "Run"}
                    </Button>
                  )}
                  {st?.output && <CollapsibleTrigger asChild><Button size="icon" variant="ghost" aria-label="Show result"><ChevronDown className="size-4" /></Button></CollapsibleTrigger>}
                </div>
                {st?.output && (
                  <CollapsibleContent>
                    {st.model && <div className="border-t px-5 pt-3 text-xs text-muted-foreground">Made with {st.model}</div>}
                    <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap bg-muted/40 p-5 font-sans text-sm leading-relaxed">{st.output}</pre>
                  </CollapsibleContent>
                )}
              </Collapsible>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-xs text-muted-foreground">Stages run in order and can't be skipped. Redoing a stage resets the stages after it.</p>
    </>
  );
}
