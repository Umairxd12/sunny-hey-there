import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText, Film, FolderKanban, Share2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatCard, StatusBadge } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { PROVIDERS } from "@/lib/providers";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => pageHead("Dashboard", "Overview of your cartoon video production and publishing."),
  component: Dashboard,
});

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [p, v, s, skill] = await Promise.all([
        supabase.from("projects").select("id, title, status, updated_at").order("updated_at", { ascending: false }).limit(5),
        supabase.from("videos").select("id", { count: "exact", head: true }),
        supabase.from("scheduled_posts").select("id", { count: "exact", head: true }),
        supabase.from("skills").select("id, enabled, active_version_id").limit(1).maybeSingle(),
      ]);
      return { projects: p.data ?? [], videos: v.count ?? 0, posts: s.count ?? 0, skill: skill.data };
    },
  });
  const skillReady = !!data?.skill?.active_version_id && data.skill.enabled;

  return (
    <>
      <PageHeader title="Dashboard" description="Everything happening in your studio, at a glance."
        action={<Button asChild><Link to="/create"><Sparkles className="size-4" />Create video</Link></Button>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Projects" value={data?.projects.length ?? "–"} hint="Recent" icon={FolderKanban} />
        <StatCard label="Videos" value={data?.videos ?? "–"} icon={Film} />
        <StatCard label="Scheduled posts" value={data?.posts ?? "–"} icon={Share2} />
        <StatCard label="Skill" value={skillReady ? "Active" : "Missing"} hint={skillReady ? "Used in every step" : "Upload in Skill Manager"} icon={BookOpenText} />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border bg-card p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold">Recent projects</h2>
          {data?.projects.length ? (
            <ul className="mt-4 divide-y">
              {data.projects.map((p) => (
                <li key={p.id}><Link to="/projects/$projectId" params={{ projectId: p.id }} className="flex items-center justify-between py-3 hover:text-primary">
                  <span className="font-medium">{p.title}</span><StatusBadge status={p.status} /></Link></li>
              ))}
            </ul>
          ) : <p className="mt-4 text-sm text-muted-foreground">No projects yet. Start with “Create video”.</p>}
        </section>
        <section className="rounded-2xl border bg-card p-6">
          <h2 className="text-lg font-semibold">Connections</h2>
          <ul className="mt-4 space-y-3">
            {PROVIDERS.map((p) => (<li key={p.id} className="flex items-center justify-between text-sm"><span>{p.name}</span><StatusBadge status={p.status} /></li>))}
          </ul>
        </section>
      </div>
    </>
  );
}
