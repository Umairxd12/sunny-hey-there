import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Brush, ChevronDown, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { delegateFullPipeline } from "@/lib/pipeline.functions";
import { TWOD_STYLE } from "./create";
import { EmptyState, PageHeader, StatusBadge } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/studio-2d")({
  component: Studio2D,
});

/**
 * Dedicated 2D Studio section: 2D minimalist scholar videos with the user's
 * locked caveman character. Fully worker-driven — TechGenie invents the idea,
 * script, storyboard, images and video. Zero website AI, zero credits.
 */
function Studio2D() {
  const navigate = useNavigate();
  const delegateFull = useServerFn(delegateFullPipeline);
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState("60");
  const [showManual, setShowManual] = useState(false);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [idea, setIdea] = useState("");

  const projectsQuery = useQuery({
    queryKey: ["studio-2d-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects")
        .select("id, title, status, created_at, target_duration_seconds")
        .ilike("visual_style", "%2d%")
        .order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function createProject(p: { title: string; topic: string; idea: string }) {
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("projects").insert({
      title: p.title, idea: p.idea, topic: p.topic || null,
      target_duration_seconds: Number(duration), aspect_ratio: "16:9",
      target_platform: "YouTube (wide)", language: "English",
      visual_style: TWOD_STYLE, user_id: u.user!.id,
    }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "Could not create project");
    return data.id as string;
  }

  /** TRUE ONE CLICK: no website AI at all. The worker invents the idea and
   *  makes everything — script, storyboard, characters, video, voiceover. */
  async function oneClick() {
    setBusy(true);
    try {
      const id = await createProject({ title: "2D video — idea TechGenie banayega", topic: "", idea: "" });
      const res = await delegateFull({ data: { projectId: id } });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Ho gaya! TechGenie 2D video bana raha hai — idea, script, storyboard, video, voiceover, sab.");
      navigate({ to: "/projects/$projectId", params: { projectId: id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Video start nahi ho saka. Dobara try karein.");
    } finally {
      setBusy(false);
    }
  }

  /** Manual: user gives their own idea, worker makes everything from it. */
  async function createManual(e: React.FormEvent) {
    e.preventDefault();
    if (!idea.trim()) { toast.error("Apna video idea likhein."); return; }
    setBusy(true);
    try {
      const id = await createProject({ title: title || "2D video", topic, idea });
      const res = await delegateFull({ data: { projectId: id } });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("TechGenie aapke idea pe 2D video bana raha hai.");
      navigate({ to: "/projects/$projectId", params: { projectId: id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Video start nahi ho saka. Dobara try karein.");
    } finally {
      setBusy(false);
    }
  }

  const projects = projectsQuery.data ?? [];

  return (
    <>
      <PageHeader title="2D Studio" description="Minimalist scholar cartoons with your locked caveman character. One click — TechGenie does everything: idea, script, storyboard, video, voiceover. No website AI, no credits." />

      <div className="mb-5 flex max-w-2xl items-center gap-4 rounded-2xl border bg-card p-4">
        <img src="/characters/scholar-protagonist.jpg" alt="Locked 2D character: minimalist caveman protagonist" className="h-20 w-14 shrink-0 rounded-xl object-cover" />
        <div className="text-sm">
          <p className="font-semibold">Locked 2D character: caveman protagonist</p>
          <p className="mt-0.5 text-muted-foreground">White oval face, spiky black hair, brown fur tunic — locked for every 2D video. The 3D otter &amp; raccoon are never used here.</p>
        </div>
      </div>

      <div className="max-w-2xl space-y-5 rounded-2xl border bg-card p-6">
        <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <div className="space-y-1.5">
            <Label>Length</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["15", "30", "60", "120"].map((d) => <SelectItem key={d} value={d}>{d} seconds</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">Narration wali scholar videos ke liye 60 seconds best hai.</p>
        </div>
        <Button type="button" size="lg" className="w-full" onClick={oneClick} disabled={busy}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Wand2 className="size-5" />}
          {busy ? "TechGenie kaam shuru kar raha hai…" : "Poora 2D video banwao — 1 click"}
        </Button>
        <p className="-mt-2 text-xs text-muted-foreground">Idea bhi TechGenie khud banayega — topic, script, storyboard, characters, video, voiceover. Aapko kuch nahi karna.</p>

        <div className="border-t pt-4">
          <button type="button" onClick={() => setShowManual((v) => !v)} className="flex items-center gap-2 text-sm font-medium">
            <ChevronDown className={`size-4 transition-transform ${showManual ? "rotate-180" : ""}`} />
            Apna idea dena hai? (optional)
          </button>
          {showManual && (
            <form onSubmit={createManual} className="mt-4 space-y-4">
              <div className="space-y-1.5"><Label htmlFor="t2d">Title</Label><Input id="t2d" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Tiny Tool That Outlasted the Ice Age" /></div>
              <div className="space-y-1.5"><Label htmlFor="topic2d">Topic</Label><Input id="topic2d" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ice Age Needle" /></div>
              <div className="space-y-1.5"><Label htmlFor="i2d">Video idea</Label><Textarea id="i2d" rows={4} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Kya hota agar…?" /></div>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Mere idea pe video banao
              </Button>
            </form>
          )}
        </div>
      </div>

      <div className="mt-8 max-w-2xl">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Brush className="size-5" />Meri 2D videos</h2>
        {projectsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !projects.length ? (
          <EmptyState title="Abhi koi 2D video nahi" icon={Brush} description="Upar 1 click dabayein — pehli 2D video yahin nazar aayegi." />
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm transition-colors hover:border-primary">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.title}</span>
                  <span className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}{p.target_duration_seconds ? ` · ${p.target_duration_seconds}s` : ""}</span>
                </span>
                <StatusBadge status={p.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
