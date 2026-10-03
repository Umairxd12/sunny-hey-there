import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { PageHeader } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pageHead } from "@/lib/seo";
import { CONNECT_TO_ENABLE, NOT_AVAILABLE, PLATFORMS, PLATFORM_INFO, type SocialPlatform } from "@/lib/social/types";
import { disconnectSocialAccount, getSocialSetup, listSocialAccounts, setProjectAccounts, startSocialConnect, syncSocialAccount } from "@/lib/social.functions";

export const Route = createFileRoute("/_authenticated/social")({
  head: () => pageHead("Social Accounts", "Connect Facebook Pages, YouTube channels and TikTok accounts with official sign-in."),
  component: SocialPage,
});

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "Never");

function SocialPage() {
  const qc = useQueryClient();
  const setupFn = useServerFn(getSocialSetup);
  const listFn = useServerFn(listSocialAccounts);
  const connectFn = useServerFn(startSocialConnect);
  const disconnectFn = useServerFn(disconnectSocialAccount);
  const syncFn = useServerFn(syncSocialAccount);
  const linkFn = useServerFn(setProjectAccounts);
  const setup = useQuery({ queryKey: ["social-setup"], queryFn: () => setupFn() });
  const list = useQuery({ queryKey: ["social-accounts"], queryFn: () => listFn() });
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("connected")) toast.success(`Connected ${q.get("count")} ${PLATFORM_INFO[q.get("connected") as SocialPlatform]?.name ?? ""} account(s).`);
    if (q.get("error")) toast.error(q.get("error")!);
    if (q.get("connected") || q.get("error")) window.history.replaceState({}, "", "/social");
  }, []);

  const refresh = () => qc.invalidateQueries({ queryKey: ["social-accounts"] });

  async function connect(platform: SocialPlatform, reconnectAccountId?: string) {
    setBusy(platform);
    const r = await connectFn({ data: { platform, reconnectAccountId } });
    setBusy(null);
    if (!r.ok) { toast.error(r.error); return; }
    window.location.href = r.url;
  }

  const accounts = list.data?.accounts ?? [];
  const links = list.data?.links ?? [];
  const projects = list.data?.projects ?? [];

  return (
    <>
      <PageHeader title="Social accounts" description="Connect with each platform's official sign-in. We never ask for or store your passwords — only encrypted access keys." />
      <div className="grid gap-4 lg:grid-cols-3">
        {PLATFORMS.map((p) => {
          const info = PLATFORM_INFO[p];
          const s = setup.data?.find((x) => x.platform === p);
          const mine = accounts.filter((a) => a.platform === p);
          return (
            <section key={p} className="flex flex-col rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{info.name}</h3>
                <Badge variant={s?.configured ? "default" : "secondary"}>{s?.configured ? "Ready" : "Not connected"}</Badge>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {info.capabilities.map((c) => (
                  <li key={c.label} className="flex items-start gap-2">
                    {c.available ? <Check className="mt-0.5 h-4 w-4 text-primary" /> : <X className="mt-0.5 h-4 w-4 text-muted-foreground" />}
                    <span className={c.available ? "" : "text-muted-foreground"}>{c.label}{!c.available && ` — ${NOT_AVAILABLE}`}</span>
                  </li>
                ))}
              </ul>
              {s && !s.configured && (
                <p className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                  Needs your {info.name} developer app keys ({s.secrets.join(", ")}). Callback address: <span className="break-all font-mono">{s.callbackUrl}</span>
                </p>
              )}
              <Button className="mt-4" disabled={!s?.configured || busy === p} onClick={() => connect(p)}>
                {busy === p ? "Opening…" : `Connect ${info.name}`}
              </Button>
              <div className="mt-4 space-y-3">
                {mine.map((a) => (
                  <div key={a.id} className="rounded-xl border p-3 text-sm">
                    <div className="flex items-center gap-3">
                      {a.avatar_url ? <img src={a.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="h-9 w-9 rounded-full bg-muted" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{a.account_name}</p>
                        <p className="text-xs text-muted-foreground">{info.unit}</p>
                      </div>
                      <Badge variant={a.status === "connected" ? "default" : "secondary"}>{a.status}</Badge>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <dt>Access</dt><dd>{a.token_status}{a.token_expires_at ? ` · until ${fmt(a.token_expires_at)}` : ""}</dd>
                      <dt>Last sync</dt><dd>{fmt(a.last_sync_at)}</dd>
                      <dt>Last video</dt><dd className="truncate">{a.last_published_title ? `${a.last_published_title} (${fmt(a.last_published_at)})` : "None yet"}</dd>
                    </dl>
                    {a.last_error && <p className="mt-2 text-xs text-destructive">{a.last_error}</p>}
                    {projects.length > 0 && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-muted-foreground">Projects using this account</summary>
                        <div className="mt-1 space-y-1">
                          {projects.map((pr) => {
                            const on = links.some((l) => l.project_id === pr.id && l.account_id === a.id);
                            return (
                              <label key={pr.id} className="flex items-center gap-2">
                                <input type="checkbox" checked={on} onChange={async () => {
                                  const ids = links.filter((l) => l.project_id === pr.id).map((l) => l.account_id).filter((id) => id !== a.id);
                                  const r = await linkFn({ data: { projectId: pr.id, accountIds: on ? ids : [...ids, a.id] } });
                                  if (!r.ok) toast.error(r.error); refresh();
                                }} />
                                {pr.title}
                              </label>
                            );
                          })}
                        </div>
                      </details>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {a.status === "connected" && <Button size="sm" variant="outline" onClick={async () => { const r = await syncFn({ data: { accountId: a.id } }); r.ok ? toast.success("Synced") : toast.error(r.error); refresh(); }}>Sync</Button>}
                      <Button size="sm" variant="outline" disabled={!s?.configured} onClick={() => connect(p, a.id)}>Reconnect</Button>
                      {a.status === "connected" && <Button size="sm" variant="ghost" onClick={async () => { await disconnectFn({ data: { accountId: a.id } }); toast.success("Disconnected"); refresh(); }}>Disconnect</Button>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
