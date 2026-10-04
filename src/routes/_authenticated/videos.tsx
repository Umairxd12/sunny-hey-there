import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Film, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, PageHeader, RouteErrorFallback, StatusBadge } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { deleteVideo } from "@/lib/automation.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/videos")({
  head: () => pageHead("Videos", "Generated cartoon videos."),
  errorComponent: RouteErrorFallback,
  component: Page,
});

type Row = { projectId: string; title: string; url: string | null; status: string; createdAt: string; source: "studio" | "chat"; platform: string; style: string };

const PLATFORM_ORDER = ["TikTok", "Facebook Reels", "Facebook feed", "YouTube Shorts", "YouTube (wide)"];
const sectionOf = (platform: string) => PLATFORM_ORDER.includes(platform) ? platform : "Other";

function Page() {
  const router = useRouter();
  const removeVideo = useServerFn(deleteVideo);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["videos"],
    queryFn: async () => {
      const [vids, assets, projects] = await Promise.all([
        supabase.from("videos").select("project_id, status, video_url, provider, created_at").order("created_at", { ascending: false }).limit(100),
        supabase.from("video_assets").select("project_id, url, metadata, created_at").eq("kind", "final").order("created_at", { ascending: false }).limit(100),
        supabase.from("projects").select("id, title, target_platform, visual_style"),
      ]);
      const info = new Map((projects.data ?? []).map((p) => [p.id, { title: p.title, platform: (p.target_platform as string | null) ?? "Other", style: (p.visual_style as string | null) ?? "" }]));
      const rows = new Map<string, Row>();
      for (const v of vids.data ?? []) {
        if (!v.project_id || rows.has(v.project_id)) continue;
        const inf = info.get(v.project_id) ?? { title: "Untitled", platform: "Other", style: "" };
        rows.set(v.project_id, { projectId: v.project_id, title: inf.title, url: v.video_url, status: v.status ?? "unknown", createdAt: v.created_at, source: v.provider === "chat-assistant" ? "chat" : "studio", platform: inf.platform, style: inf.style });
      }
      for (const a of assets.data ?? []) {
        if (!a.project_id || rows.has(a.project_id)) continue;
        const meta = (a as any).metadata as { source?: string } | null;
        const inf = info.get(a.project_id) ?? { title: "Untitled", platform: "Other", style: "" };
        rows.set(a.project_id, { projectId: a.project_id, title: inf.title, url: a.url, status: "done", createdAt: a.created_at, source: meta?.source === "chat" ? "chat" : "studio", platform: inf.platform, style: inf.style });
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
  const sections = [...PLATFORM_ORDER, "Other"]
    .map((name) => ({ name, rows: rows.filter((r) => sectionOf(r.platform) === name) }))
    .filter((s) => s.rows.length > 0);
  return (
    <>
      <PageHeader title="Videos" description="Finished videos, grouped by the platform they were made for. Open any video to review it, then approve it for auto-publishing or reject it." />
      <div className="space-y-8">
        {sections.map((s) => (
          <section key={s.name}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-lg font-semibold">{s.name}</h2>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{s.rows.length}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {s.rows.map((r) => (
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
                        {/2d/i.test(r.style) && <span className="rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary">2D</span>}
                        {new Date(r.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" asChild><Link to="/workspace/$projectId" params={{ projectId: r.projectId }}>Review</Link></Button>
                      <Button size="icon" variant="ghost" aria-label="Delete video" title="Delete video" onClick={async () => {
                        if (!window.confirm(`Delete "${r.title}"? The project stays — you can generate the video again.`)) return;
                        const res = await removeVideo({ data: { projectId: r.projectId } });
                        if (res.ok) { toast.success("Video deleted."); refetch(); router.invalidate(); }
                        else toast.error(res.error);
                      }}><Trash2 className="size-4" /></Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
