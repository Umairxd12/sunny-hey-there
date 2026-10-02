import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, PageHeader } from "./ui";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/** Shared list for AI-generated artifacts (characters, storyboards). */
export function ArtifactList({ table, title, description, icon, emptyText }: {
  table: "characters" | "storyboards"; title: string; description: string; icon: LucideIcon; emptyText: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: [table],
    queryFn: async () => {
      const { data } = await supabase.from(table).select("id, project_id, created_at, " + (table === "characters" ? "description" : "content") + ", projects(title)").order("created_at", { ascending: false });
      return (data ?? []) as unknown as { id: string; project_id: string; created_at: string; description?: string; content?: string; projects: { title: string } | null }[];
    },
  });
  return (
    <>
      <PageHeader title={title} description={description} />
      {isLoading ? null : !data?.length ? <EmptyState icon={icon} title={`No ${title.toLowerCase()} yet`} description={emptyText} /> : (
        <div className="space-y-3">
          {data.map((r) => (
            <Collapsible key={r.id} className="rounded-2xl border bg-card">
              <CollapsibleTrigger className="flex w-full items-center justify-between p-5 text-left">
                <div><div className="font-semibold">{r.projects?.title ?? "Project"}</div><div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div></div>
                <Link to="/projects/$projectId" params={{ projectId: r.project_id }} className="text-sm text-primary" onClick={(e) => e.stopPropagation()}>Open project</Link>
              </CollapsibleTrigger>
              <CollapsibleContent><pre className="max-h-[480px] overflow-auto whitespace-pre-wrap border-t bg-muted/40 p-5 font-sans text-sm">{r.description ?? r.content}</pre></CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}
    </>
  );
}

export function NotConnectedPage({ title, description, icon, body, cta }: { title: string; description: string; icon: LucideIcon; body: string; cta: { to: "/social" | "/providers"; label: string } }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState icon={icon} title="Waiting for a connection" description={body}
        action={<Link to={cta.to} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">{cta.label}</Link>} />
    </>
  );
}
