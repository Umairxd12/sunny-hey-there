import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpenText, Eye, Power, RotateCcw, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, PageHeader, StatusBadge } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseSkill, validateSkillFile, type ParsedSkill } from "@/lib/skill-parser";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/skills")({
  head: () => pageHead("Skill Manager", "Upload and manage the SKILL.md that drives every production step."),
  component: SkillManager,
});

type Pending = { file: File; content: string; parsed: ParsedSkill };
type Version = { id: string; name: string | null; version: number; file_name: string; size_bytes: number; status: string; content: string; created_at: string; updated_at: string };

function Outline({ parsed }: { parsed: ParsedSkill }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground"><span>{parsed.headings.length} sections</span><span>{parsed.words.toLocaleString()} words</span><span>{parsed.lines} lines</span></div>
      <ul className="max-h-40 space-y-1 overflow-auto rounded-lg border p-3 text-sm">
        {parsed.headings.map((h, i) => <li key={i} style={{ paddingLeft: (h.level - 1) * 14 }} className={h.level === 1 ? "font-semibold" : ""}>{h.text}</li>)}
      </ul>
    </div>
  );
}

function SkillManager() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [preview, setPreview] = useState<Version | null>(null);
  const [toDelete, setToDelete] = useState<Version | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["skills"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: u.user!.id, _role: "admin" });
      if (!isAdmin) return { isAdmin: false as const };
      const { data: skill } = await supabase.from("skills").select("*").order("created_at").limit(1).maybeSingle();
      const versions: Version[] = skill ? (await supabase.from("skill_versions").select("id, name, version, file_name, size_bytes, status, content, created_at, updated_at").eq("skill_id", skill.id).order("version", { ascending: false })).data ?? [] : [];
      const { data: used } = await supabase.from("projects").select("skill_version_id").not("skill_version_id", "is", null);
      return { isAdmin: true as const, skill, versions, usedIds: new Set((used ?? []).map((r) => r.skill_version_id)) };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["skills"] });

  async function pickFile(file: File) {
    if (fileRef.current) fileRef.current.value = "";
    const err = validateSkillFile(file);
    if (err) { toast.error(err); return; }
    const content = await file.text();
    const { parsed, error } = parseSkill(content);
    if (error) { toast.error(error); return; }
    setPending({ file, content, parsed });
  }

  async function saveVersion(activate: boolean) {
    if (!pending || !data?.isAdmin) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      let skill = data.skill;
      if (!skill) {
        const { data: s, error } = await supabase.from("skills").insert({ name: pending.parsed.title, created_by: u.user!.id }).select("*").single();
        if (error) throw error;
        skill = s;
      }
      const nextVersion = (data.versions[0]?.version ?? 0) + 1;
      const { data: v, error } = await supabase.from("skill_versions").insert({
        skill_id: skill.id, version: nextVersion, name: pending.parsed.title, file_name: pending.file.name,
        content: pending.content, size_bytes: pending.file.size, status: "inactive", created_by: u.user!.id,
      }).select("id").single();
      if (error) throw error;
      if (activate) {
        const { error: aErr } = await supabase.rpc("activate_skill_version", { _version_id: v.id });
        if (aErr) throw aErr;
      }
      toast.success(`Version ${nextVersion} saved${activate ? " and activated" : ""}`);
      setPending(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save this version");
    } finally {
      setBusy(false);
    }
  }

  async function activate(v: Version) {
    const { error } = await supabase.rpc("activate_skill_version", { _version_id: v.id });
    if (error) { toast.error(error.message); return; }
    toast.success(`Version ${v.version} is now active`);
    refresh();
  }

  async function deactivate(v: Version) {
    const { error } = await supabase.from("skill_versions").update({ status: "inactive" }).eq("id", v.id);
    if (error) { toast.error(error.message); return; }
    if (data?.isAdmin && data.skill) await supabase.from("skills").update({ active_version_id: null }).eq("id", data.skill.id);
    toast.success("Skill deactivated. Production is paused until a version is active.");
    refresh();
  }

  async function remove(v: Version) {
    const { error } = await supabase.from("skill_versions").delete().eq("id", v.id).neq("status", "active");
    setToDelete(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Version ${v.version} deleted`);
    refresh();
  }

  if (isLoading) return null;
  if (data && !data.isAdmin) return (<><PageHeader title="Skill Manager" /><EmptyState icon={BookOpenText} title="Administrators only" description="Only the studio administrator can manage the production skill." /></>);
  if (!data?.isAdmin) return null;
  const { skill, versions, usedIds } = data;
  const active = versions.find((v) => v.status === "active");

  const uploadBtn = (
    <>
      <input ref={fileRef} type="file" accept=".md,text/markdown" className="hidden" onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />
      <Button onClick={() => fileRef.current?.click()} disabled={busy}><Upload className="size-4" />{skill ? "Upload new version" : "Upload SKILL.md"}</Button>
    </>
  );

  return (
    <>
      <PageHeader title="Skill Manager" description="The active SKILL.md is the master instruction system. It's added on the server to every production stage — it never goes to the browser during production." action={uploadBtn} />

      <div className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5 ${active ? "bg-card" : "border-warning bg-warning/10"}`}>
        <div>
          <div className="text-sm text-muted-foreground">Active skill</div>
          <div className="font-display text-xl font-semibold">{active ? `${active.name ?? active.file_name} · v${active.version}` : "No active skill"}</div>
          <div className="text-xs text-muted-foreground">{active ? `Activated ${new Date(active.updated_at).toLocaleString()}` : "Production stages will not run until a version is active."}</div>
        </div>
        <StatusBadge status={active ? "active" : "inactive"} />
      </div>

      {!versions.length ? (
        <EmptyState icon={BookOpenText} title="No skill uploaded" description="Upload your SKILL.md. It will be checked, parsed and saved as version 1." action={uploadBtn} />
      ) : (
        <section className="rounded-2xl border bg-card">
          <div className="p-5"><h2 className="text-lg font-semibold">Version history</h2></div>
          <Table>
            <TableHeader><TableRow><TableHead>Version</TableHead><TableHead>Name</TableHead><TableHead>Size</TableHead><TableHead>Created</TableHead><TableHead>Updated</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {versions.map((v) => {
                const isActive = v.status === "active";
                const inUse = usedIds.has(v.id);
                return (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">v{v.version}</TableCell>
                    <TableCell><div>{v.name ?? "—"}</div><div className="text-xs text-muted-foreground">{v.file_name}</div></TableCell>
                    <TableCell>{(v.size_bytes / 1024).toFixed(1)} KB</TableCell>
                    <TableCell className="text-sm">{new Date(v.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-sm">{new Date(v.updated_at).toLocaleDateString()}</TableCell>
                    <TableCell><StatusBadge status={v.status} /></TableCell>
                    <TableCell className="space-x-1 whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => setPreview(v)}><Eye className="size-4" />Preview</Button>
                      {isActive ? (
                        <Button size="sm" variant="outline" onClick={() => deactivate(v)}><Power className="size-4" />Deactivate</Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => activate(v)}><RotateCcw className="size-4" />{active && v.version < active.version ? "Restore" : "Activate"}</Button>
                      )}
                      {!isActive && !inUse && <Button size="sm" variant="ghost" aria-label="Delete version" onClick={() => setToDelete(v)}><Trash2 className="size-4" /></Button>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="px-5 pb-4 pt-2 text-xs text-muted-foreground">Only one version can be active. Versions used by a project can't be deleted.</p>
        </section>
      )}

      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Check your skill: {pending?.parsed.title}</DialogTitle></DialogHeader>
          {pending && <><Outline parsed={pending.parsed} /><pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-sm">{pending.content}</pre></>}
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={busy} onClick={() => saveVersion(false)}>Save as inactive</Button>
            <Button disabled={busy} onClick={() => saveVersion(true)}>{busy ? "Saving…" : "Save and activate"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{preview?.name ?? preview?.file_name} · v{preview?.version}</DialogTitle></DialogHeader>
          {preview && <><Outline parsed={parseSkill(preview.content).parsed} /><pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-sm">{preview.content}</pre></>}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete version {toDelete?.version}?</AlertDialogTitle>
            <AlertDialogDescription>This version isn't active or used by any project. It will be removed permanently.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => toDelete && remove(toDelete)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
