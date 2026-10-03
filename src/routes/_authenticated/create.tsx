import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { suggestVideoIdeas, generateVideoBrief } from "@/lib/pipeline.functions";
import { LOCKED_CHARACTERS } from "@/lib/character-lock";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/create")({
  head: () => pageHead("Create Video", "Start a new 3D cartoon video from an idea."),
  component: CreateVideo,
});

const PLATFORMS: Record<string, string> = { tiktok: "9:16", youtube_shorts: "9:16", facebook_reels: "9:16", youtube: "16:9", facebook: "1:1" };
const PLATFORM_LABEL: Record<string, string> = { tiktok: "TikTok", youtube_shorts: "YouTube Shorts", facebook_reels: "Facebook Reels", youtube: "YouTube (wide)", facebook: "Facebook feed" };

function CreateVideo() {
  const navigate = useNavigate();
  const suggest = useServerFn(suggestVideoIdeas);
  const genBrief = useServerFn(generateVideoBrief);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [idea, setIdea] = useState("");
  const [duration, setDuration] = useState("15");
  const [platform, setPlatform] = useState("tiktok");
  const [ratio, setRatio] = useState("9:16");
  const [language, setLanguage] = useState("English");
  const [audience, setAudience] = useState("");
  const [refs, setRefs] = useState("");
  const [style, setStyle] = useState("");
  const [reqs, setReqs] = useState("");
  const [busy, setBusy] = useState(false);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [briefBusy, setBriefBusy] = useState(false);
  const [ideas, setIdeas] = useState<{ title: string; idea: string }[]>([]);

  /** One click: AI invents a topic + title and writes the description for it. */
  async function aiBrief() {
    setBriefBusy(true);
    try {
      const res = await genBrief({ data: { duration: Number(duration), language } });
      if (!res.ok) { toast.error(res.error); return; }
      setTitle(res.brief.title);
      setTopic(res.brief.topic);
      setIdea(res.brief.description);
      toast.success("AI ne topic, title aur description bana diya — dekho aur 1 click me video banao.");
    } catch {
      toast.error("AI brief nahi ban saka. Dobara try karein.");
    } finally {
      setBriefBusy(false);
    }
  }

  async function getIdeas() {
    setIdeasBusy(true);
    try {
      const res = await suggest({ data: { topic: topic || undefined, platform: PLATFORM_LABEL[platform], audience: audience || undefined, duration: Number(duration), language } });
      if (!res.ok) toast.error(res.error);
      else if (!res.ideas.length) toast.error("No ideas came back. Please try again.");
      else setIdeas(res.ideas);
    } catch {
      toast.error("Could not suggest ideas. Please try again.");
    } finally {
      setIdeasBusy(false);
    }
  }

  async function submit(e: React.FormEvent, autostart = false) {
    e.preventDefault();
    if (!idea.trim()) { toast.error("Write an idea or pick a suggested one."); return; }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("projects")
      .insert({
        title, idea, topic: topic || null, target_duration_seconds: Number(duration), aspect_ratio: ratio,
        target_platform: PLATFORM_LABEL[platform] ?? platform, target_audience: audience || null, reference_notes: refs || null,
        language, visual_style: style || null, video_requirements: reqs || null, user_id: u.user!.id,
      })
      .select("id").single();
    setBusy(false);
    if (error || !data) { toast.error(error?.message ?? "Could not create project"); return; }
    navigate({ to: "/projects/$projectId", params: { projectId: data.id }, search: { ...(autostart ? { autostart: "1" as const } : {}) } });
  }

  return (
    <>
      <PageHeader title="Create video" description="Step 1 — describe your idea. One click hands everything else to TechGenie." />
      <div className="mb-5 flex max-w-2xl items-center gap-4 rounded-2xl border bg-card p-4">
        <img src={LOCKED_CHARACTERS.images.duo} alt="Locked characters: otter and raccoon" className="h-20 w-14 shrink-0 rounded-xl object-cover" />
        <div className="text-sm">
          <p className="font-semibold">Locked characters: otter & raccoon</p>
          <p className="mt-0.5 text-muted-foreground">Your approved cast — goggles, tool belt, scale — is locked for every video. Script, storyboard, characters and the video itself are all made by TechGenie through the studio API.</p>
        </div>
      </div>
      <form onSubmit={(e) => submit(e, true)} className="max-w-2xl space-y-5 rounded-2xl border bg-card p-6">
        <Button type="button" variant="secondary" className="w-full" onClick={aiBrief} disabled={briefBusy}>
          {briefBusy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {briefBusy ? "AI soch raha hai…" : "AI se topic, title aur description banwao"}
        </Button>
        <div className="space-y-1.5"><Label htmlFor="t">Title</Label><Input id="t" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The brave little robot" /></div>
        <div className="space-y-1.5"><Label htmlFor="topic">Topic</Label><Input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Sharing, friendship, rainy day…" /></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>Length</Label>
            <Select value={duration} onValueChange={setDuration}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["8", "10", "15", "20", "30", "60"].map((d) => <SelectItem key={d} value={d}>{d} seconds</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Platform</Label>
            <Select value={platform} onValueChange={(v) => { setPlatform(v); setRatio(PLATFORMS[v] ?? ratio); }}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PLATFORM_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Format</Label>
            <Select value={ratio} onValueChange={setRatio}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="9:16">Vertical 9:16</SelectItem><SelectItem value="16:9">Wide 16:9</SelectItem><SelectItem value="1:1">Square 1:1</SelectItem></SelectContent></Select></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="lang">Language</Label><Input id="lang" value={language} onChange={(e) => setLanguage(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="aud">Target audience</Label><Input id="aud" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Kids 4–8, families" /></div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="i">Video idea</Label>
            <Button type="button" size="sm" variant="outline" onClick={getIdeas} disabled={ideasBusy}>
              {ideasBusy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Suggest ideas
            </Button>
          </div>
          <Textarea id="i" rows={5} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="A tiny robot learns to share its umbrella during a rainy day in a candy-colored city…" />
          {ideas.length > 0 && (
            <div className="grid gap-2 pt-1">
              {ideas.map((s) => (
                <button key={s.title} type="button" onClick={() => { setIdea(s.idea); if (!title) setTitle(s.title); }}
                  className="rounded-xl border bg-background p-3 text-left text-sm transition-colors hover:border-primary">
                  <span className="font-medium">{s.title}</span><span className="block text-muted-foreground">{s.idea}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-1.5"><Label htmlFor="refs">References (optional)</Label><Textarea id="refs" rows={2} value={refs} onChange={(e) => setRefs(e.target.value)} placeholder="Links or notes: a character you like, a scene, a mood…" /></div>
        <div className="space-y-1.5"><Label htmlFor="sty">Visual style notes (optional)</Label><Input id="sty" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Pixar-like, soft pastel lighting" /></div>
        <div className="space-y-1.5"><Label htmlFor="req">Video requirements (optional)</Label><Textarea id="req" rows={3} value={reqs} onChange={(e) => setReqs(e.target.value)} placeholder="No text on screen, end with a logo shot, kid-safe…" /></div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy}>{busy ? "Creating…" : "Create & generate video — 1 click"}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={(e) => submit(e as unknown as React.FormEvent, false)}>Create project only</Button>
        </div>
        <p className="text-xs text-muted-foreground">“Create & generate” hands the whole production to TechGenie — script, storyboard, locked characters and video, all made through the studio API exactly as your active skill defines — then shows you the finished video to approve or reject.</p>
      </form>
    </>
  );
}
