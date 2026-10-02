import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Copy, Download, Film, Loader2, Music, RefreshCw, Scissors, Send, Sparkles, Trash2, Undo2, CalendarClock, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { getEditingRecommendations, regenerateClip, renderMaster } from "@/lib/workspace.functions";
import { pageHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/workspace/$projectId")({
  head: () => pageHead("Video workspace", "Review, edit and finish a generated cartoon video."),
  component: Workspace,
});

const REVIEW_AREAS = ["Character consistency", "Story consistency", "Visual quality", "Camera quality", "Animation quality", "Audio quality", "Timing", "Final punchline"];
type Check = { area: string; status: "PASS" | "WARNING" | "NEEDS REGENERATION"; note?: string };
type Failed = { from: number; to: number; clipIndex?: number; kind?: string; reason: string; fix?: string };
const TRANSITIONS = ["cut", "crossfade", "fade to black", "whip pan", "zoom"];
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function Workspace() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const recommend = useServerFn(getEditingRecommendations);
  const regen = useServerFn(regenerateClip);
  const render = useServerFn(renderMaster);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [recs, setRecs] = useState<string | null>(null);
  const [playAll, setPlayAll] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { data } = useQuery({
    queryKey: ["workspace", projectId],
    queryFn: async () => {
      const [p, clips, reviews, audio, assets, history, steps] = await Promise.all([
        supabase.from("projects").select("*").eq("id", projectId).single(),
        supabase.from("video_clips").select("*").eq("project_id", projectId).order("position"),
        supabase.from("video_reviews").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1),
        supabase.from("video_audio_tracks").select("*").eq("project_id", projectId).order("start_s"),
        supabase.from("video_assets").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
        supabase.from("production_history").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(30),
        supabase.from("pipeline_steps").select("step_key, output, status").eq("project_id", projectId),
      ]);
      return { project: p.data, clips: clips.data ?? [], review: reviews.data?.[0] ?? null, audio: audio.data ?? [], assets: assets.data ?? [], history: history.data ?? [], steps: steps.data ?? [] };
    },
  });

  const clips = data?.clips ?? [];
  const live = clips.filter((c) => !c.is_deleted);
  const clip = clips.find((c) => c.id === selected) ?? live[0] ?? null;

  useEffect(() => {
    const v = videoRef.current;
    if (v && clip) { v.currentTime = Number(clip.trim_start); v.volume = Math.min(1, Number(clip.volume)); }
  }, [clip?.id, clip?.trim_start, clip?.volume]);

  if (!data?.project) return <p className="text-muted-foreground">Loading…</p>;
  const { project, review, audio, assets, history, steps } = data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["workspace", projectId] });
  const log = (action: string, detail?: string) => supabase.from("production_history").insert({ project_id: projectId, action, detail: detail ?? null });
  const checks = (review?.checks as Check[] | null) ?? [];
  const failed = (review?.failed_segments as Failed[] | null) ?? [];
  const meta = steps.find((s) => s.step_key === "metadata" && s.status === "done")?.output ?? "";
  const hashtags = Array.from(new Set(meta.match(/#[\p{L}\p{N}_]+/gu) ?? [])).join(" ");
  const caption = meta.match(/caption[^\n]*:\s*(.+)/i)?.[1]?.trim() ?? "";
  const finalAsset = assets.find((a) => a.kind === "final");
  const duration = project.target_duration_seconds;

  async function act(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    try { await fn(); if (done) toast.success(done); } catch { toast.error("Something went wrong. Please try again."); }
    finally { setBusy(null); refresh(); }
  }
  const update = (id: string, patch: Record<string, unknown>, action: string) =>
    act(id + action, async () => { const { error } = await supabase.from("video_clips").update(patch).eq("id", id); if (error) throw error; await log(action); });

  async function move(idx: number, dir: -1 | 1) {
    const a = live[idx], b = live[idx + dir];
    if (!a || !b) return;
    await act("move", async () => {
      await supabase.from("video_clips").update({ position: b.position }).eq("id", a.id);
      await supabase.from("video_clips").update({ position: a.position }).eq("id", b.id);
      await log(`Reorder clip ${a.position + 1}`);
    });
  }

  async function split(c: typeof clips[number], at: number) {
    const from = Number(c.from_s), to = Number(c.to_s);
    if (!(at > from && at < to)) return toast.error(`Pick a second between ${from} and ${to}.`);
    await act("split", async () => {
      for (const later of clips.filter((x) => x.position > c.position)) await supabase.from("video_clips").update({ position: later.position + 1 }).eq("id", later.id);
      await supabase.from("video_clips").update({ to_s: at, trim_end: 0 }).eq("id", c.id);
      await supabase.from("video_clips").insert({ project_id: projectId, position: c.position + 1, from_s: at, to_s: to, trim_start: at - from, trim_end: c.trim_end, prompt: c.prompt, video_url: c.video_url, source: "split", status: c.status });
      await log(`Split clip ${c.position + 1} at ${at}s`);
    }, "Clip split");
  }

  async function doRegen(clipId: string, fix?: string) {
    setBusy("regen" + clipId);
    const res = await regen({ data: { projectId, clipId, ...(fix ? { fix } : {}) } });
    setBusy(null);
    if (!res.ok) toast.error(res.error); else toast.success("Regeneration started");
    refresh();
  }

  function onEnded() {
    if (!playAll || !clip) return;
    const i = live.findIndex((c) => c.id === clip.id);
    const next = live[i + 1];
    if (next) setSelected(next.id); else setPlayAll(false);
  }
  function onTime() {
    const v = videoRef.current;
    if (v && clip && Number(clip.trim_end) > 0 && v.duration && v.currentTime >= v.duration - Number(clip.trim_end)) { v.pause(); onEnded(); }
  }

  async function createPost(schedule: boolean) {
    await act("post", async () => {
      const { error } = await supabase.from("scheduled_posts").insert({ project_id: projectId, platform: project.target_platform ?? "youtube", title: project.title, caption, hashtags, status: "draft" });
      if (error) throw error;
      await log(schedule ? "Created post to schedule" : "Created post to publish");
    }, schedule ? "Post saved — set the time in Scheduler" : "Post saved — publish it from Scheduler once an account is connected");
  }

  const copy = (t: string, what: string) => { if (!t) return toast.error(`No ${what} yet — run the Metadata stage.`); navigator.clipboard.writeText(t); toast.success(`${what} copied`); };

  return (
    <>
      <PageHeader title={project.title} description="Review, fix and finish your video."
        action={<Button variant="outline" asChild><Link to="/projects/$projectId" params={{ projectId }}>Back to production</Link></Button>} />

      <div className="grid gap-4 lg:grid-cols-[260px_1fr_320px]">
        {/* LEFT: project info */}
        <aside className="space-y-4 rounded-2xl border bg-card p-5 text-sm">
          <div className="flex items-center gap-2"><span className="font-medium">Status</span><StatusBadge status={project.status} /></div>
          <dl className="space-y-2">
            {[["Length", `${duration}s`], ["Format", project.aspect_ratio], ["Platform", project.target_platform ?? "—"], ["Language", project.language], ["Audience", project.target_audience ?? "—"]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2"><dt className="text-muted-foreground">{k}</dt><dd className="text-right">{v}</dd></div>
            ))}
          </dl>
          <p className="text-muted-foreground">{project.idea}</p>
          <div className="flex items-center justify-between gap-2 rounded-xl bg-secondary p-3">
            <Label htmlFor="auto" className="text-xs leading-snug">Publish automatically when finished</Label>
            <Switch id="auto" checked={project.auto_publish} onCheckedChange={(v) => act("auto", async () => { await supabase.from("projects").update({ auto_publish: v }).eq("id", projectId); await log(v ? "Auto-publish turned on" : "Auto-publish turned off"); })} />
          </div>
          <p className="text-xs text-muted-foreground">Off by default. Nothing is ever posted unless you publish it or turn this on.</p>
          <div>
            <h4 className="mb-2 font-semibold">History</h4>
            <ul className="max-h-56 space-y-1.5 overflow-auto text-xs">
              {history.length ? history.map((h) => <li key={h.id}><span className="text-muted-foreground">{new Date(h.created_at).toLocaleString()}</span> · {h.action}</li>) : <li className="text-muted-foreground">No changes yet.</li>}
            </ul>
          </div>
        </aside>

        {/* CENTER: player + editing */}
        <section className="space-y-4">
          <div className="overflow-hidden rounded-2xl border bg-card">
            {clip?.video_url ? (
              <video ref={videoRef} key={clip.id + clip.video_url} src={clip.video_url} controls autoPlay={playAll} onEnded={onEnded} onTimeUpdate={onTime} className="aspect-video w-full bg-foreground/90" />
            ) : (
              <div className="grid aspect-video place-items-center bg-muted p-6 text-center text-sm text-muted-foreground">
                <div><Film className="mx-auto mb-2 size-8" />{clips.length ? "This clip has no video yet." : "No clips yet. They appear here after the Video generation stage runs with a connected video provider."}</div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t p-3 text-sm">
              <span className="font-medium">{clip ? `Clip ${live.indexOf(clip) + 1} · ${mmss(Number(clip.from_s))}–${mmss(Number(clip.to_s))}` : "No clip selected"}</span>
              {clip && <StatusBadge status={clip.status} />}
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" disabled={!live.length} onClick={() => { setPlayAll(true); setSelected(live[0]!.id); }}>Play whole video</Button>
              </div>
            </div>
          </div>

          {clip && (
            <div className="rounded-2xl border bg-card p-5">
              <h3 className="mb-4 font-semibold">Edit this clip</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumPair label="Trim (seconds off start / end)" a={Number(clip.trim_start)} b={Number(clip.trim_end)} onSave={(a, b) => update(clip.id, { trim_start: a, trim_end: b }, `Trim clip ${clip.position + 1}`)} />
                <NumPair label="Timing (from / to second)" a={Number(clip.from_s)} b={Number(clip.to_s)} onSave={(a, b) => b > a ? update(clip.id, { from_s: a, to_s: b }, `Retime clip ${clip.position + 1}`) : toast.error("End must be after start.")} />
                <SplitBox onSplit={(t) => split(clip, t)} />
                <div className="space-y-1.5">
                  <Label>Transition into next clip</Label>
                  <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={clip.transition} onChange={(e) => update(clip.id, { transition: e.target.value }, `Transition: ${e.target.value}`)}>
                    {TRANSITIONS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Clip volume · {Math.round(Number(clip.volume) * 100)}%</Label>
                  <Slider min={0} max={150} step={5} defaultValue={[Number(clip.volume) * 100]} onValueCommit={([v]) => update(clip.id, { volume: (v ?? 100) / 100 }, `Volume clip ${clip.position + 1}`)} />
                </div>
                <ReplaceBox onReplace={(url) => update(clip.id, { video_url: url, source: "replaced", status: "replaced" }, `Replace clip ${clip.position + 1}`)} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => doRegen(clip.id)}>{busy === "regen" + clip.id ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Regenerate clip</Button>
                <Button size="sm" variant="outline" disabled={!clip.video_url} onClick={() => act("final", async () => { await supabase.from("video_assets").insert({ project_id: projectId, kind: "final", url: clip.video_url, metadata: { clipId: clip.id } }); await log(`Selected clip ${clip.position + 1} as final video`); }, "Set as final video")}><Star className="size-4" />Use as final video</Button>
                <Button size="sm" variant="outline" onClick={() => update(clip.id, { is_deleted: true }, `Delete clip ${clip.position + 1}`)}><Trash2 className="size-4" />Delete segment</Button>
              </div>
            </div>
          )}

          <AudioPanel tracks={audio} onAdd={(t) => act("audio", async () => { const { error } = await supabase.from("video_audio_tracks").insert({ project_id: projectId, ...t }); if (error) throw error; await log(`Added ${t.kind}: ${t.label}`); })}
            onVolume={(id, v) => act("vol", async () => { await supabase.from("video_audio_tracks").update({ volume: v }).eq("id", id); })}
            onRemove={(id) => act("rm", async () => { await supabase.from("video_audio_tracks").delete().eq("id", id); await log("Removed audio track"); })} />
        </section>

        {/* RIGHT: AI review */}
        <aside className="space-y-4">
          <div className="rounded-2xl border bg-card p-5">
            <h3 className="mb-3 font-semibold">AI review</h3>
            <ul className="space-y-2 text-sm">
              {REVIEW_AREAS.map((area) => {
                const c = checks.find((x) => x.area.toLowerCase() === area.toLowerCase());
                return (
                  <li key={area} className="flex items-start justify-between gap-2">
                    <div><div>{area}</div>{c?.note && <div className="text-xs text-muted-foreground">{c.note}</div>}</div>
                    <ReviewBadge status={c?.status} />
                  </li>
                );
              })}
            </ul>
            {!review && <p className="mt-3 text-xs text-muted-foreground">Results appear after the Video analysis stage runs with a connected video analysis provider.</p>}
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <h3 className="mb-3 font-semibold">Failed sections</h3>
            {failed.length ? (
              <ul className="space-y-3 text-sm">
                {failed.map((f, i) => {
                  const target = clips.find((c) => (f.clipIndex !== undefined ? c.position === f.clipIndex : Number(c.from_s) <= f.from && Number(c.to_s) > f.from));
                  return (
                    <li key={i} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between"><span className="font-medium">{mmss(f.from)}–{mmss(f.to)}</span>{f.kind && <Badge variant="secondary">{f.kind.replaceAll("_", " ")}</Badge>}</div>
                      <p className="mt-1"><span className="text-muted-foreground">Problem: </span>{f.reason}</p>
                      <p className="mt-1"><span className="text-muted-foreground">Fix: </span>{f.fix ?? "Regenerate this part following the storyboard."}</p>
                      <Button size="sm" className="mt-2" disabled={!target || !!busy} onClick={() => target && doRegen(target.id, f.fix ?? f.reason)}><RefreshCw className="size-4" />Regenerate</Button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No failed sections reported.</p>}
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Editing advice</h3>
              <Button size="sm" variant="outline" disabled={busy === "recs"} onClick={async () => { setBusy("recs"); const r = await recommend({ data: { projectId } }); setBusy(null); if (r.ok) setRecs(r.text); else toast.error(r.error); refresh(); }}>
                {busy === "recs" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}Ask AI</Button></div>
            {recs ? <pre className="max-h-72 overflow-auto whitespace-pre-wrap font-sans text-sm">{recs}</pre> : <p className="text-sm text-muted-foreground">Get edit suggestions based on your storyboard.</p>}
          </div>
        </aside>
      </div>

      {/* BOTTOM: timeline */}
      <div className="mt-4 rounded-2xl border bg-card p-5">
        <h3 className="mb-3 font-semibold">Timeline</h3>
        <div className="mb-1 text-xs text-muted-foreground">Storyboard seconds</div>
        <div className="flex gap-px overflow-x-auto">
          {Array.from({ length: duration }, (_, s) => {
            const bad = failed.some((f) => s >= f.from && s < f.to);
            return <div key={s} title={`Second ${s}`} className={cn("min-w-5 flex-1 rounded-sm py-1 text-center text-[10px]", bad ? "bg-destructive/20 text-destructive" : "bg-secondary text-muted-foreground")}>{String(s).padStart(2, "0")}</div>;
          })}
        </div>
        <div className="mb-1 mt-3 text-xs text-muted-foreground">Clips</div>
        {live.length ? (
          <div className="flex gap-1 overflow-x-auto">
            {live.map((c, i) => {
              const len = Math.max(1, Number(c.to_s) - Number(c.from_s));
              const tone = c.status === "failed" ? "border-destructive bg-destructive/10" : c.status === "regenerated" || c.status === "regenerating" || c.status === "replaced" ? "border-primary bg-primary/10" : "border-border bg-secondary";
              return (
                <div key={c.id} style={{ flexGrow: len }} className={cn("min-w-28 rounded-lg border-2 p-2 text-xs", tone, clip?.id === c.id && "ring-2 ring-primary")}>
                  <button className="w-full text-left" onClick={() => { setPlayAll(false); setSelected(c.id); }}>
                    <div className="font-medium">Clip {i + 1}</div>
                    <div className="text-muted-foreground">{mmss(Number(c.from_s))}–{mmss(Number(c.to_s))} · {c.status}</div>
                    <div className="text-muted-foreground">→ {c.transition}</div>
                  </button>
                  <div className="mt-1 flex gap-1">
                    <Button size="icon" variant="ghost" className="size-6" aria-label="Move left" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-3 -rotate-90" /></Button>
                    <Button size="icon" variant="ghost" className="size-6" aria-label="Move right" disabled={i === live.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-3 -rotate-90" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : <p className="text-sm text-muted-foreground">No clips yet.</p>}
        {clips.some((c) => c.is_deleted) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="text-muted-foreground">Deleted:</span>
            {clips.filter((c) => c.is_deleted).map((c) => <Button key={c.id} size="sm" variant="ghost" onClick={() => update(c.id, { is_deleted: false }, `Restore clip ${c.position + 1}`)}><Undo2 className="size-3" />Clip {c.position + 1}</Button>)}
          </div>
        )}
        {audio.length > 0 && (<><div className="mb-1 mt-3 text-xs text-muted-foreground">Audio</div>
          <div className="flex flex-wrap gap-1">{audio.map((a) => <Badge key={a.id} variant="secondary"><Music className="mr-1 size-3" />{a.label} @ {mmss(Number(a.start_s))}</Badge>)}</div></>)}
      </div>

      {/* FINAL */}
      <div className="mt-4 rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-semibold">Final video</h3><p className="text-sm text-muted-foreground">Joins all clips, edits and audio into one master MP4.</p></div>
          <Button disabled={busy === "render"} onClick={async () => { setBusy("render"); const r = await render({ data: { projectId } }); setBusy(null); if (r.ok) toast.success("Rendering started"); else toast.error(r.error); refresh(); }}>
            {busy === "render" ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}Render final MP4</Button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {[["original", "Original video"], ["edited", "Edited version"], ["final", "Final version"], ["thumbnail", "Thumbnail"]].map(([k, l]) => {
            const a = assets.find((x) => x.kind === k);
            return <div key={k} className="rounded-xl bg-secondary p-3 text-sm"><div className="font-medium">{l}</div><div className="text-xs text-muted-foreground">{a ? new Date(a.created_at).toLocaleString() : "Not created yet"}</div></div>;
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" disabled={!finalAsset?.url} asChild={!!finalAsset?.url}>
            {finalAsset?.url ? <a href={finalAsset.url} download target="_blank" rel="noreferrer"><Download className="size-4" />Download video</a> : <span><Download className="size-4" />Download video</span>}
          </Button>
          <Button variant="outline" onClick={() => copy(caption, "Caption")}><Copy className="size-4" />Copy caption</Button>
          <Button variant="outline" onClick={() => copy(hashtags, "Hashtags")}><Copy className="size-4" />Copy hashtags</Button>
          <Button disabled={!finalAsset} onClick={() => createPost(false)}><Send className="size-4" />Publish</Button>
          <Button variant="outline" disabled={!finalAsset} onClick={() => createPost(true)}><CalendarClock className="size-4" />Schedule</Button>
        </div>
        {!finalAsset && <p className="mt-2 text-xs text-muted-foreground">Publish and Schedule unlock once a final video exists.</p>}
      </div>
    </>
  );
}

function ReviewBadge({ status }: { status?: Check["status"] | undefined }) {
  const cls = status === "PASS" ? "bg-success/15 text-success" : status === "WARNING" ? "bg-warning/20 text-foreground" : status ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground";
  return <Badge variant="secondary" className={cn("shrink-0 border-0", cls)}>{status ?? "Not reviewed"}</Badge>;
}

function NumPair({ label, a, b, onSave }: { label: string; a: number; b: number; onSave: (a: number, b: number) => void }) {
  const [x, setX] = useState(a); const [y, setY] = useState(b);
  useEffect(() => { setX(a); setY(b); }, [a, b]);
  return (
    <div className="space-y-1.5"><Label>{label}</Label>
      <div className="flex gap-2"><Input type="number" step="0.1" min={0} value={x} onChange={(e) => setX(Number(e.target.value))} /><Input type="number" step="0.1" min={0} value={y} onChange={(e) => setY(Number(e.target.value))} />
        <Button variant="outline" onClick={() => onSave(x, y)}>Save</Button></div></div>
  );
}

function SplitBox({ onSplit }: { onSplit: (t: number) => void }) {
  const [t, setT] = useState("");
  return (
    <div className="space-y-1.5"><Label>Split at second</Label>
      <div className="flex gap-2"><Input type="number" step="0.1" value={t} onChange={(e) => setT(e.target.value)} placeholder="e.g. 4" />
        <Button variant="outline" onClick={() => onSplit(Number(t))}><Scissors className="size-4" />Split</Button></div></div>
  );
}

function ReplaceBox({ onReplace }: { onReplace: (url: string) => void }) {
  const [u, setU] = useState("");
  return (
    <div className="space-y-1.5"><Label>Replace clip (video link)</Label>
      <div className="flex gap-2"><Input value={u} onChange={(e) => setU(e.target.value)} placeholder="https://…/clip.mp4" />
        <Button variant="outline" disabled={!/^https:\/\//.test(u)} onClick={() => { onReplace(u); setU(""); }}>Replace</Button></div></div>
  );
}

function AudioPanel({ tracks, onAdd, onVolume, onRemove }: {
  tracks: { id: string; kind: string; label: string; start_s: number; volume: number; url: string | null }[];
  onAdd: (t: { kind: string; label: string; url: string | null; start_s: number; volume: number }) => void;
  onVolume: (id: string, v: number) => void; onRemove: (id: string) => void;
}) {
  const [kind, setKind] = useState("sfx"); const [label, setLabel] = useState(""); const [url, setUrl] = useState(""); const [start, setStart] = useState("0");
  return (
    <div className="rounded-2xl border bg-card p-5">
      <h3 className="mb-3 font-semibold">Sound effects & music</h3>
      <div className="grid gap-2 sm:grid-cols-[110px_1fr_1fr_90px_auto]">
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}><option value="sfx">SFX</option><option value="music">Music</option></select>
        <Input placeholder="Name, e.g. Boing" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Input placeholder="Audio link (optional)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Input type="number" min={0} step="0.1" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start second" />
        <Button variant="outline" disabled={!label.trim()} onClick={() => { onAdd({ kind, label: label.trim(), url: url.trim() || null, start_s: Number(start), volume: 1 }); setLabel(""); setUrl(""); }}>Add</Button>
      </div>
      {tracks.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm">
          {tracks.map((t) => (
            <li key={t.id} className="flex items-center gap-3">
              <Badge variant="secondary">{t.kind === "music" ? "Music" : "SFX"}</Badge>
              <span className="w-32 truncate">{t.label} @ {Number(t.start_s)}s</span>
              <Slider className="flex-1" min={0} max={150} step={5} defaultValue={[Number(t.volume) * 100]} onValueCommit={([v]) => onVolume(t.id, (v ?? 100) / 100)} />
              <span className="w-10 text-xs text-muted-foreground">{Math.round(Number(t.volume) * 100)}%</span>
              <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => onRemove(t.id)}><Trash2 className="size-4" /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
