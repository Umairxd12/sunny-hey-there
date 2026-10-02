import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Loader2, Play, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PIPELINE_STEPS } from "@/lib/pipeline";
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
  const doneCount = PIPELINE_STEPS.filter((s) => stepOf(s.key)?.status === "done").length;

  async function runStep(key: string) {
    setRunning(key);
    try {
      const res = await run({ data: { projectId, stepKey: key } });
      if (!res.ok) toast.error(res.error); else toast.success("Step finished");
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
        <div className="flex items-center justify-between text-sm"><span className="font-medium">Production progress</span><span className="text-muted-foreground">{doneCount} of {PIPELINE_STEPS.length} steps</span></div>
        <Progress className="mt-3" value={(doneCount / PIPELINE_STEPS.length) * 100} />
      </div>
      <ol className="space-y-3">
        {PIPELINE_STEPS.map((def, i) => {
          const st = stepOf(def.key);
          const prevDone = PIPELINE_STEPS.slice(0, i).filter((d) => d.kind === "ai_text").every((d) => stepOf(d.key)?.status === "done");
          const status = def.kind === "external" ? "blocked" : running === def.key ? "running" : st?.status ?? "pending";
          return (
            <li key={def.key} className="rounded-2xl border bg-card">
              <Collapsible>
                <div className="flex flex-wrap items-center gap-4 p-5">
                  <div className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary font-display text-sm font-semibold">{i + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{def.label}</h3><StatusBadge status={status} /></div>
                    <p className="text-sm text-muted-foreground">{def.description}</p>
                    {st?.error && <p className="mt-1 text-sm text-destructive">{st.error}</p>}
                  </div>
                  {def.kind === "ai_text" ? (
                    <Button size="sm" variant={st?.status === "done" ? "outline" : "default"} disabled={!prevDone || !!running} onClick={() => runStep(def.key)}>
                      {running === def.key ? <Loader2 className="size-4 animate-spin" /> : st?.status === "done" ? <RotateCcw className="size-4" /> : <Play className="size-4" />}
                      {running === def.key ? "Working…" : st?.status === "done" ? "Regenerate" : "Run"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" asChild><Link to={def.requires === "social" ? "/social" : "/providers"}>Connect</Link></Button>
                  )}
                  {st?.output && <CollapsibleTrigger asChild><Button size="icon" variant="ghost" aria-label="Show result"><ChevronDown className="size-4" /></Button></CollapsibleTrigger>}
                </div>
                {st?.output && (
                  <CollapsibleContent>
                    <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap border-t bg-muted/40 p-5 font-sans text-sm leading-relaxed">{st.output}</pre>
                  </CollapsibleContent>
                )}
              </Collapsible>
            </li>
          );
        })}
      </ol>
    </>
  );
}
