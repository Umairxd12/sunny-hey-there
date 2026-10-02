import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/create")({
  head: () => pageHead("Create Video", "Start a new 3D cartoon video from an idea."),
  component: CreateVideo,
});

function CreateVideo() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [duration, setDuration] = useState("30");
  const [ratio, setRatio] = useState("9:16");
  const [busy, setBusy] = useState(false);
  const [language, setLanguage] = useState("English");
  const [style, setStyle] = useState("");
  const [reqs, setReqs] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("projects")
      .insert({ title, idea, target_duration_seconds: Number(duration), aspect_ratio: ratio, language, visual_style: style || null, video_requirements: reqs || null, user_id: u.user!.id })
      .select("id").single();
    setBusy(false);
    if (error || !data) { toast.error(error?.message ?? "Could not create project"); return; }
    navigate({ to: "/projects/$projectId", params: { projectId: data.id } });
  }

  return (
    <>
      <PageHeader title="Create video" description="Describe your idea. The studio then walks it through every production step." />
      <form onSubmit={submit} className="max-w-2xl space-y-5 rounded-2xl border bg-card p-6">
        <div className="space-y-1.5"><Label htmlFor="t">Title</Label><Input id="t" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The brave little robot" /></div>
        <div className="space-y-1.5"><Label htmlFor="i">Video idea</Label><Textarea id="i" required rows={5} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="A tiny robot learns to share its umbrella during a rainy day in a candy-colored city…" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Length</Label>
            <Select value={duration} onValueChange={setDuration}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["8", "15", "30", "60"].map((d) => <SelectItem key={d} value={d}>{d} seconds</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Format</Label>
            <Select value={ratio} onValueChange={setRatio}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="9:16">Vertical 9:16 (Shorts, TikTok, Reels)</SelectItem><SelectItem value="16:9">Wide 16:9 (YouTube)</SelectItem><SelectItem value="1:1">Square 1:1</SelectItem></SelectContent></Select></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="lang">Language</Label><Input id="lang" value={language} onChange={(e) => setLanguage(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="sty">Visual style notes (optional)</Label><Input id="sty" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Pixar-like, soft pastel lighting" /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="req">Video requirements (optional)</Label><Textarea id="req" rows={3} value={reqs} onChange={(e) => setReqs(e.target.value)} placeholder="No text on screen, end with a logo shot, kid-safe…" /></div>
        <Button disabled={busy}>{busy ? "Creating…" : "Create project"}</Button>
      </form>
    </>
  );
}
