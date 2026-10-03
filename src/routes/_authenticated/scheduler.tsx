import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { OctagonX, Play, Plus, X } from "lucide-react";
import { PageHeader } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { pageHead } from "@/lib/seo";
import { getAutomation, saveAutomation, setEmergencyStop } from "@/lib/automation.functions";
import { COUNTRIES, formatInZone, nextSlot, type ScheduleRule } from "@/lib/automation/schedule";
import { PLATFORMS, PLATFORM_INFO } from "@/lib/social/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/scheduler")({
  head: () => pageHead("Scheduler", "Automatic publishing settings, posting times and the emergency stop."),
  component: SchedulerPage,
});

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const US_ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"];

type Form = { country: "US"; timezone: string; frequency: ScheduleRule["frequency"]; days_of_week: number[]; publish_times: string[]; custom_slots: string[]; platforms: ("facebook" | "youtube" | "tiktok")[]; account_ids: string[] };

function SchedulerPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getAutomation);
  const saveFn = useServerFn(saveAutomation);
  const stopFn = useServerFn(setEmergencyStop);
  const q = useQuery({ queryKey: ["automation"], queryFn: () => getFn() });
  const [form, setForm] = useState<Form | null>(null);
  const [newTime, setNewTime] = useState("12:00");
  const [newSlot, setNewSlot] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (q.data && !form) {
      const s = q.data.settings;
      setForm({ country: "US", timezone: s.timezone, frequency: s.frequency as Form["frequency"], days_of_week: s.days_of_week, publish_times: s.publish_times, custom_slots: s.custom_slots, platforms: s.platforms as Form["platforms"], account_ids: s.account_ids });
    }
  }, [q.data, form]);

  const zones = useMemo(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : US_ZONES;
    return [...US_ZONES, ...all.filter((z) => !US_ZONES.includes(z))];
  }, []);

  const preview = useMemo(() => {
    if (!form) return [];
    const out: Date[] = [];
    let after = new Date();
    for (let i = 0; i < 3; i++) { const n = nextSlot(form, after); if (!n) break; out.push(n); after = n; }
    return out;
  }, [form]);

  if (!q.data || !form) return <PageHeader title="Scheduler" description="Loading your automation settings…" />;
  const stopped = q.data.settings.emergency_stop;
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function save() {
    setSaving(true);
    const r = await saveFn({ data: form! });
    setSaving(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Automation settings saved");
    qc.invalidateQueries({ queryKey: ["automation"] });
  }

  async function emergency(stoppedNext: boolean) {
    const r = await stopFn({ data: { stopped: stoppedNext } });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(stoppedNext ? "All automated publishing stopped" : "Automated publishing resumed");
    qc.invalidateQueries({ queryKey: ["automation"] });
  }

  return (
    <>
      <PageHeader title="Scheduler" description="Decide when and where finished videos are published. Videos only publish automatically for projects where you've turned on auto-publish." />

      <section className={cn("mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5", stopped ? "border-destructive bg-destructive/10" : "bg-card")}>
        <div>
          <h2 className="text-lg font-semibold">{stopped ? "Emergency stop is ON" : "Emergency stop"}</h2>
          <p className="text-sm text-muted-foreground">
            {stopped ? `All automated publishing has been paused since ${new Date(q.data.settings.emergency_stopped_at!).toLocaleString()}. Videos already published are not affected.` : "Instantly stops every future automated post. Videos already published stay as they are."}
          </p>
        </div>
        {stopped ? (
          <Button onClick={() => emergency(false)}><Play className="size-4" /> Resume automated publishing</Button>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="destructive" size="lg"><OctagonX className="size-4" /> Stop all publishing</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Stop all automated publishing?</AlertDialogTitle>
                <AlertDialogDescription>No scheduled or retrying post will go out until you resume. Nothing already published is changed or deleted.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => emergency(true)}>Stop everything</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-5 rounded-2xl border bg-card p-6">
          <h2 className="text-lg font-semibold">Audience & time zone</h2>
          <div className="space-y-2">
            <Label>Target country</Label>
            <Select value={form.country} onValueChange={() => set({ country: "US" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Titles, captions and hashtags are written in natural American English for US viewers. This sets who the content is written for and when it posts — it does not change or pretend to change your actual location.</p>
          </div>
          <div className="space-y-2">
            <Label>Time zone</Label>
            <Select value={form.timezone} onValueChange={(v) => set({ timezone: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">{zones.map((z) => <SelectItem key={z} value={z}>{z.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </section>

        <section className="space-y-5 rounded-2xl border bg-card p-6">
          <h2 className="text-lg font-semibold">How often</h2>
          <div className="grid grid-cols-3 gap-2">
            {([["daily", "Every day"], ["specific_days", "Specific days"], ["custom", "Custom dates"]] as const).map(([v, l]) => (
              <Button key={v} variant={form.frequency === v ? "default" : "outline"} onClick={() => set({ frequency: v })}>{l}</Button>
            ))}
          </div>
          {form.frequency === "specific_days" && (
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => <Button key={d} size="sm" variant={form.days_of_week.includes(i) ? "default" : "outline"} onClick={() => set({ days_of_week: toggle(form.days_of_week, i) })}>{d}</Button>)}
            </div>
          )}
          {form.frequency !== "custom" ? (
            <div className="space-y-2">
              <Label>Publishing times</Label>
              <div className="flex flex-wrap gap-2">
                {form.publish_times.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-sm">{t}<button aria-label={`Remove ${t}`} onClick={() => set({ publish_times: form.publish_times.filter((x) => x !== t) })}><X className="size-3" /></button></span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-36" />
                <Button variant="outline" onClick={() => newTime && !form.publish_times.includes(newTime) && set({ publish_times: [...form.publish_times, newTime].sort() })}><Plus className="size-4" /> Add time</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Exact dates & times (your time zone: {form.timezone})</Label>
              <ul className="space-y-1 text-sm">
                {form.custom_slots.map((s) => (
                  <li key={s} className="flex items-center justify-between rounded-lg bg-muted px-3 py-1.5">{formatInZone(s, form.timezone, "date")} · {formatInZone(s, form.timezone, "time")}<button aria-label="Remove" onClick={() => set({ custom_slots: form.custom_slots.filter((x) => x !== s) })}><X className="size-3" /></button></li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Input type="datetime-local" value={newSlot} onChange={(e) => setNewSlot(e.target.value)} className="w-56" />
                <Button variant="outline" onClick={() => {
                  const m = newSlot.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/); if (!m) return;
                  import("@/lib/automation/schedule").then(({ zonedTimeToUtc }) => {
                    const iso = zonedTimeToUtc(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, form.timezone).toISOString();
                    if (!form.custom_slots.includes(iso)) set({ custom_slots: [...form.custom_slots, iso].sort() });
                  });
                }}><Plus className="size-4" /> Add</Button>
              </div>
            </div>
          )}
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium">Next publishing times</p>
            {preview.length ? preview.map((d) => <p key={d.toISOString()} className="text-muted-foreground">{formatInZone(d.toISOString(), form.timezone, "date")} · {formatInZone(d.toISOString(), form.timezone, "time")}</p>) : <p className="text-muted-foreground">No upcoming times — add one above.</p>}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold">Where to publish</h2>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => <Button key={p} variant={form.platforms.includes(p) ? "default" : "outline"} onClick={() => set({ platforms: toggle(form.platforms, p) })}>{PLATFORM_INFO[p].name}</Button>)}
          </div>
          {q.data.accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No connected accounts yet. <Link to="/social" className="text-primary underline">Connect Facebook, YouTube or TikTok</Link> to choose them here.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {q.data.accounts.filter((a) => !form.platforms.length || form.platforms.includes(a.platform as Form["platforms"][number])).map((a) => (
                <label key={a.id} className="flex items-center gap-3 rounded-xl border p-3 text-sm">
                  <input type="checkbox" checked={form.account_ids.includes(a.id)} onChange={() => set({ account_ids: toggle(form.account_ids, a.id) })} />
                  <span className="flex-1 truncate">{a.account_name}</span>
                  <span className="text-xs text-muted-foreground">{PLATFORM_INFO[a.platform as Form["platforms"][number]]?.name}</span>
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">If a project has its own accounts chosen on the Social Accounts page, those are used instead.</p>
          <div className="flex justify-end"><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button></div>
        </section>
      </div>
    </>
  );
}
