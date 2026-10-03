import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Film } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, PageHeader, StatusBadge } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/videos")({
  head: () => pageHead("Videos", "Generated cartoon videos."),
  component: Page,
});

type Row = { projectId: string; title: string; url: string | null; status: string; createdAt: string; source: "studio" | "chat" };

function Page() {
  const { data, isLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: async () => {
      const [vids, assets, projects] = await Promise.all([
        supabase.from("videos").select("project_id, status, video_url, provider, created_at").order("created_at", { ascending: false }).limit(100),
        supabase.from("video_assets").select("project_id, url, metadata, created_at").eq("kind", "final").order("created_at", { ascending: false }).limit(100),
        supabase.from("projects").select("id, title"),
      ]);
      const titles = new Map((projects.data ?? []).map((p) => [p.id, p.title]));
      const rows = new Map<string, Row>();
      for (const v of vids.data ?? []) {
        if (!v.project_id || rows.has(v.project_id)) continue;
        rows.set(v.project_id, { projectId: v.project_id, title: titles.get(v.project_id) ?? "Untitled", url: v.video_url, status: v.status ?? "unknown", createdAt: v.created_at, source: v.provider === "chat-assistant" ? "chat" : "studio" });
      }
      for (const a of assets.data ?? []) {
        if (!a.project_id || rows.has(a.project_id)) continue;
        const meta = (a as any).metadata as { source?: string } | null;
        rows.set(a.project_id, { projectId: a.project_id, title: titles.get(a.project_id) ?? "Untitled", url: a.url, status: "done", createdAt: a.created_at, source: meta?.source === "chat" ? "chat" : "studio" });
      }
      return [...rows.values()].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  const rows = data ?? [];
  if (!rows.length) {
    return (
      <EmptyState title="No videos yet" icon={Film}
        description="Create a video and run the 1-click generation — finished videos appear here for your review."
        action={<Button asChild><Link to="/create">Create video</Link></Button>} />
    );
  }
  return (
    <>
      <PageHeader title="Videos" description="Finished videos. Open any video to review it, then approve it for auto-publishing or reject it." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <article key={r.projectId} className="overflow-hidden rounded-2xl border bg-card">
            {r.url ? (
              <video src={r.url} controls preload="metadata" className="aspect-video w-full bg-foreground/90" />
            ) : (
              <div className="grid aspect-video place-items-center bg-muted text-sm text-muted-foreground"><Film className="mb-1 size-6" />No preview available</div>
            )}
            <div className="flex items-center justify-between gap-2 p-4">
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{r.title}</h3>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <StatusBadge status={r.status} />
                  <span className="rounded-full bg-secondary px-2 py-0.5">{r.source === "chat" ? "Made in chat" : "Studio"}</span>
                  {new Date(r.createdAt).toLocaleString()}
                </p>
              </div>
              <Button size="sm" asChild><Link to="/workspace/$projectId" params={{ projectId: r.projectId }}>Review</Link></Button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
