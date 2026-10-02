import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FolderKanban, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, PageHeader, StatusBadge } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => pageHead("Projects", "All your cartoon video projects."),
  component: Projects,
});

function Projects() {
  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await supabase.from("projects").select("*").order("updated_at", { ascending: false })).data ?? [],
  });
  return (
    <>
      <PageHeader title="Projects" description="Each project is one video moving through the pipeline."
        action={<Button asChild><Link to="/create"><Sparkles className="size-4" />New project</Link></Button>} />
      {isLoading ? null : !data?.length ? (
        <EmptyState icon={FolderKanban} title="No projects yet" description="Create your first video idea to start production." action={<Button asChild><Link to="/create">Create video</Link></Button>} />
      ) : (
        <div className="rounded-2xl border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Length</TableHead><TableHead>Format</TableHead><TableHead>Status</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell><Link to="/projects/$projectId" params={{ projectId: p.id }} className="font-medium hover:text-primary">{p.title}</Link></TableCell>
                  <TableCell>{p.target_duration_seconds}s</TableCell><TableCell>{p.aspect_ratio}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{new Date(p.updated_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
