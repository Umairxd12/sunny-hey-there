import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, RouteErrorFallback } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { suggestVideoIdeas, generateVideoBrief } from "@/lib/pipeline.functions";
import { LOCKED_CHARACTERS } from "@/lib/character-lock";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/create")({
  head: () => pageHead("Create Video", "Start a new cartoon video from an idea — 3D or 2D."),
  errorComponent: RouteErrorFallback,
  validateSearch: (search: Record<string, unknown>): { mode?: "2d" } =>
    search["mode"] === "2d" ? { mode: "2d" } : {},
  component: CreateVideo,
});

/** Art direction applied when the user creates from the 2D Studio section. */
export const TWOD_STYLE = "2D cartoon style: flat colors, bold clean outlines, simple cel shading, playful 2D cartoon look (not 3D render)";

const PLATFORMS: Record<string, string> = { tiktok: "9:16", youtube_shorts: "9:16", facebook_reels: "9:16", youtube: "16:9", facebook: "1:1" };
const PLATFORM_LABEL: Record<string, string> = { tiktok: "TikTok", youtube_shorts: "YouTube Shorts", facebook_reels: "Facebook Reels", youtube: "YouTube (wide)", facebook: "Facebook feed" };

function CreateVideo() {
  const navigate = useNavigate();
  const { mode } = Route.useSearch();
  const is2D = mode === "2d";
  const suggest = useServerFn(suggestVideoIdeas);
  const genBrief = useServerFn(generateVideoBrief);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [idea, setIdea] = useState("");
  const [duration, setDuration] = useState("15");
  const [platform, setPlatform] = useState(is2D ? "youtube" : "tiktok");
  const [ratio, setRatio] = useState(is2D ? "16:9" : "9:16");
  const [language, setLanguage] = useState("English");
  const [audience, setAudience] = useState("");
  const [refs, setRefs] = useState("");
  const [style, setStyle] = useState(is2D ? TWOD_STYLE : "");
  // Switching between 3D and 2D modes presets style/platform (same route, no remount).
  // 2D Scholar videos are 16:9 YouTube pieces per the scholar's visual laws.
  useEffect(() => {
    setStyle(is2D ? TWOD_STYLE : "");
    setPlatform(is2D ? "youtube" : "tiktok");
    setRatio(is2D ? "16:9" : "9:16");
  }, [is2D]);
  const [reqs, setReqs] = useState("");
  const [busy, setBusy] = useState(false);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [briefBusy, setBriefBusy] = useState(false);
  const [ideas, setIdeas] = useState<{ title: string; idea: string }[]>([]);

  /** One click: AI invents a topic + title and writes the description for it. */
  async function aiBrief() {
    setBriefBusy(true);
    try {
      const res = await genBrief({ data: { duration: Number(duration), language, scholar: is2D } });
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
      const res = await suggest({ data: { topic: topic || undefined, platform: PLATFORM_LABEL[platform], audience: audience || undefined, duration: Number(duration), language, scholar: is2D } });
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
    try {
      const id = await createProject({ title, topic, idea });
      navigate({ to: "/projects/$projectId", params: { projectId: id }, search: { ...(autostart ? { autostart: "1" as const } : {}) } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create project");
    } finally {
      setBusy(false);
    }
  }

  async function createProject(p: { title: string; topic: string; idea: string }) {
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("projects")
      .insert({
        title: p.title, idea: p.idea, topic: p.topic || null, target_duration_seconds: Number(duration), aspect_ratio: ratio,
        target_platform: PLATFORM_LABEL[platform] ?? platform, target_audience: audience || null, reference_notes: refs || null,
        language, visual_style: style || null, video_requirements: reqs || null, user_id: u.user!.id,
      })
      .select("id").single();
    if (error || !data) throw new Error(error?.message ?? "Could not create project");
    return data.id as string;
  }

  /** TRUE ONE CLICK: AI invents topic + title + idea, creates the project from it,
   *  and the project page autostarts the full pipeline (script → storyboard → video). */
  async function aiFullAuto() {
    setBusy(true);
    try {
      const res = await genBrief({ data: { duration: Number(duration), language, scholar: is2D } });
      if (!res.ok) { toast.error(res.error); return; }
      const brief = res.brief;
      setTitle(brief.title);
      setTopic(brief.topic);
      setIdea(brief.description);
      const id = await createProject({ title: brief.title, topic: brief.topic, idea: brief.description });
      toast.success("AI ne idea banaya — ab TechGenie poora video bana raha hai: script, storyboard, characters, video.");
      navigate({ to: "/projects/$projectId", params: { projectId: id }, search: { autostart: "1" as const } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI video start nahi ho saka. Dobara try karein.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={is2D ? "Create 2D video" : "Create video"} description={is2D ? "2D Studio — same cast and comedy, drawn as a flat 2D cartoon. One click hands everything else to TechGenie." : "Step 1 — describe your idea. One click hands everything else to TechGenie."} />
      <div className="mb-5 flex max-w-2xl items-center gap-4 rounded-2xl border bg-card p-4">
        <img src={LOCKED_CHARACTERS.images.duo} alt="Locked characters: otter and raccoon" className="h-20 w-14 shrink-0 rounded-xl object-cover" />
        <div className="text-sm">
          <p className="font-semibold">Locked characters: otter & raccoon{is2D ? " — in 2D style" : ""}</p>
          <p className="mt-0.5 text-muted-foreground">{is2D ? "Your approved cast drawn as a flat 2D cartoon — goggles, tool belt, scale, all locked. Script, storyboard and the video itself are all made by TechGenie through the studio API." : "Your approved cast — goggles, tool belt, scale — is locked for every video. Script, storyboard, characters and the video itself are all made by TechGenie through the studio API."}</p>
        </div>
      </div>
      <form onSubmit={(e) => submit(e, true)} className="max-w-2xl space-y-5 rounded-2xl border bg-card p-6">
        <Button type="button" className="w-full" onClick={aiFullAuto} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {busy ? "AI idea bana raha hai…" : "AI idea banao aur poora video start karo — 1 click"}
        </Button>
        <p className="-mt-3 text-xs text-muted-foreground">Ek click: AI topic + title + video idea banata hai, project create hota hai, aur TechGenie poora flow chalata hai — script, storyboard, locked characters, video — phir finished video approve/reject ke liye.</p>
        <Button type="button" variant="secondary" className="w-full" onClick={aiBrief} disabled={briefBusy}>
          {briefBusy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {briefBusy ? "AI soch raha hai…" : "Sirf AI se topic, title aur description banwao"}
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
