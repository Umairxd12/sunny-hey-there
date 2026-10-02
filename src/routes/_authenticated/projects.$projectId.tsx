import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, Loader2, Play, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { STAGES, nextRunnableIndex } from "@/lib/pipeline";
import { runPipelineStep } from "@/lib/pipeline.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => pageHead("Production", "Step-by-step production pipeline for a video."),
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const run = useServerFn(runPipelineStep);
  const [running, setRunning] = useState<string | null>(null);

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

  return (
    <>
      <PageHeader title={project.title} description={project.idea}
        action={<Button variant="outline" asChild><Link to="/projects">All projects</Link></Button>} />
      <div className="mb-6 rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2 font-medium">Current status <StatusBadge status={project.status} /></span>
          <span className="text-muted-foreground">{doneCount} of {STAGES.length} stages done</span>
        </div>
        <Progress className="mt-3" value={(doneCount / STAGES.length) * 100} />
        {project.last_error && (
          <p className="mt-3 flex items-start gap-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{project.last_error}</p>
        )}
      </div>
      <ol className="space-y-3">
        {STAGES.map((def, i) => {
          const st = stepOf(def.key);
          const status = running === def.key ? "running" : st?.status ?? "pending";
          const canRun = i <= nextIdx && !running;
          const isText = def.capability === "text";
          return (
            <li key={def.key} className="rounded-2xl border bg-card">
              <Collapsible>
                <div className="flex flex-wrap items-center gap-4 p-5">
                  <div className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary font-display text-sm font-semibold">{i + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{def.label}</h3><StatusBadge status={status} />
                      {!isText && <span className="text-xs text-muted-foreground">Needs a video provider</span>}</div>
                    <p className="text-sm text-muted-foreground">{def.description}</p>
                    {st?.error && <p className="mt-1 text-sm text-destructive">{st.error}</p>}
                  </div>
                  {st?.status === "blocked" ? (
                    <Button size="sm" variant="outline" asChild><Link to="/providers">Connect provider</Link></Button>
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
