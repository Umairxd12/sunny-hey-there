import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpenText, Eye, RotateCcw, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, PageHeader, StatusBadge } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/skills")({
  head: () => pageHead("Skill Manager", "Upload and manage the SKILL.md that drives every production step."),
  component: SkillManager,
});

const MAX_BYTES = 500_000;

function SkillManager() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ title: string; content: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["skills"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: u.user!.id, _role: "admin" });
      if (!isAdmin) return { isAdmin: false as const };
      const { data: skill } = await supabase.from("skills").select("*").order("created_at").limit(1).maybeSingle();
      const versions = skill ? (await supabase.from("skill_versions").select("id, version, file_name, size_bytes, created_at, content").eq("skill_id", skill.id).order("version", { ascending: false })).data ?? [] : [];
      return { isAdmin: true as const, skill, versions };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["skills"] });

  async function onFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".md")) return toast.error("Please upload a .md file.");
    if (file.size > MAX_BYTES) return toast.error("File is too large (max 500 KB).");
    const content = await file.text();
    if (!content.trim()) return toast.error("This file is empty.");
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      let skill = data && data.isAdmin ? data.skill : null;
      if (!skill) {
        const name = content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "Video production skill";
        const { data: s, error } = await supabase.from("skills").insert({ name, created_by: u.user!.id }).select("*").single();
        if (error) throw error;
        skill = s;
      }
      const nextVersion = (data && data.isAdmin && data.versions[0]?.version ? data.versions[0].version : 0) + 1;
      const { data: v, error: vErr } = await supabase.from("skill_versions").insert({
        skill_id: skill!.id, version: nextVersion, file_name: file.name, content, size_bytes: file.size, created_by: u.user!.id,
      }).select("id").single();
      if (vErr) throw vErr;
      await supabase.from("skills").update({ active_version_id: v.id }).eq("id", skill!.id);
      toast.success(`Version ${nextVersion} uploaded and activated`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function activate(versionId: string, version: number) {
    if (!data?.isAdmin || !data.skill) return;
    const { error } = await supabase.from("skills").update({ active_version_id: versionId }).eq("id", data.skill.id);
    if (error) return toast.error(error.message);
    toast.success(`Version ${version} is now active`);
    refresh();
  }

  async function toggle(enabled: boolean) {
    if (!data?.isAdmin || !data.skill) return;
    await supabase.from("skills").update({ enabled }).eq("id", data.skill.id);
    refresh();
  }

  if (isLoading) return null;
  if (data && !data.isAdmin) return (<><PageHeader title="Skill Manager" /><EmptyState icon={BookOpenText} title="Administrators only" description="Only the studio administrator can manage the production skill." /></>);
  if (!data?.isAdmin) return null;
  const { skill, versions } = data;
  const active = versions.find((v) => v.id === skill?.active_version_id);

  const uploadBtn = (
    <>
      <input ref={fileRef} type="file" accept=".md,text/markdown" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <Button onClick={() => fileRef.current?.click()} disabled={busy}><Upload className="size-4" />{busy ? "Uploading…" : skill ? "Replace skill" : "Upload SKILL.md"}</Button>
    </>
  );

  return (
    <>
      <PageHeader title="Skill Manager" description="The active SKILL.md is added to every AI production step. Replacing it creates a new version — older versions can be restored any time." action={uploadBtn} />
      {!skill ? (
        <EmptyState icon={BookOpenText} title="No skill uploaded" description="Upload your SKILL.md file. It becomes the instruction system for meta prompts, characters, storyboards and final prompts." action={uploadBtn} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border bg-card p-5 md:col-span-2">
              <div className="text-sm text-muted-foreground">Skill</div>
              <div className="mt-1 font-display text-xl font-semibold">{skill.name}</div>
              <div className="mt-3 flex items-center gap-3"><StatusBadge status={skill.enabled ? "active" : "disabled"} />
                <label className="flex items-center gap-2 text-sm"><Switch checked={skill.enabled} onCheckedChange={toggle} />{skill.enabled ? "Enabled" : "Disabled"}</label></div>
            </div>
            <div className="rounded-2xl border bg-card p-5"><div className="text-sm text-muted-foreground">Active version</div><div className="mt-1 font-display text-xl font-semibold">{active ? `v${active.version}` : "None"}</div><div className="text-xs text-muted-foreground">{active?.file_name}</div></div>
            <div className="rounded-2xl border bg-card p-5"><div className="text-sm text-muted-foreground">Dates</div><div className="mt-1 text-sm">Created {new Date(skill.created_at).toLocaleDateString()}</div><div className="text-sm">Updated {new Date(skill.updated_at).toLocaleDateString()}</div></div>
          </div>
          <section className="mt-6 rounded-2xl border bg-card">
            <div className="p-5"><h2 className="text-lg font-semibold">Version history</h2></div>
            <Table>
              <TableHeader><TableRow><TableHead>Version</TableHead><TableHead>File</TableHead><TableHead>Size</TableHead><TableHead>Uploaded</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {versions.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">v{v.version}</TableCell><TableCell>{v.file_name}</TableCell>
                    <TableCell>{(v.size_bytes / 1024).toFixed(1)} KB</TableCell><TableCell>{new Date(v.created_at).toLocaleString()}</TableCell>
                    <TableCell>{v.id === skill.active_version_id ? <StatusBadge status="active" /> : <span className="text-sm text-muted-foreground">Previous</span>}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setPreview({ title: `${v.file_name} · v${v.version}`, content: v.content })}><Eye className="size-4" />Preview</Button>
                      {v.id !== skill.active_version_id && <Button size="sm" variant="outline" onClick={() => activate(v.id, v.version)}><RotateCcw className="size-4" />Restore</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </>
      )}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{preview?.title}</DialogTitle></DialogHeader>
          <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-sm">{preview?.content}</pre></DialogContent>
      </Dialog>
    </>
  );
}
