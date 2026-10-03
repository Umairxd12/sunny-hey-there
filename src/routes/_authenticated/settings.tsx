import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, KeyRound, Lock, ShieldCheck, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/studio/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { getIntegrationStatus } from "@/lib/settings.functions";
import { CONNECT_TO_ENABLE } from "@/lib/social/types";
import { cn } from "@/lib/utils";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => pageHead("Settings", "Your account, connected services and security."),
  component: SettingsPage,
});

function SettingsPage() {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: u.user!.id, _role: "admin" });
      return { email: u.user?.email, isAdmin: !!isAdmin };
    },
  });
  const statusFn = useServerFn(getIntegrationStatus);
  const st = useQuery({ queryKey: ["integration-status"], queryFn: () => statusFn() });
  const groups = ["AI providers", "Social platforms", "Security"] as const;

  return (
    <>
      <PageHeader title="Settings" description="Your account, the services your studio uses, and how your data is protected." />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-3 rounded-2xl border bg-card p-6 text-sm">
          <h2 className="text-base font-semibold">Account</h2>
          <div className="flex justify-between gap-2"><span className="text-muted-foreground">Email</span><span className="truncate">{me.data?.email ?? "…"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Role</span><span>{me.data ? (me.data.isAdmin ? "Administrator" : "Member") : "…"}</span></div>
          <Link to="/activity" className="block pt-2 text-primary hover:underline">View activity & audit log</Link>
        </section>
        <section className="rounded-2xl border bg-card p-6 text-sm lg:col-span-2">
          <h2 className="flex items-center gap-2 text-base font-semibold"><ShieldCheck className="size-4 text-primary" />How your data is protected</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              "We never ask for or store social media passwords — only official sign-in.",
              "Social access keys are encrypted before they're saved.",
              "Service keys live on the server and never reach your browser.",
              "Expired or revoked access is detected and shown as “Reconnect needed”.",
              "Disconnecting revokes access at the platform where it allows it.",
              "A post a platform has accepted is never sent twice.",
            ].map((t) => <li key={t} className="flex gap-2"><Lock className="mt-0.5 size-3.5 shrink-0 text-success" />{t}</li>)}
          </ul>
        </section>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Connected services</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {st.data?.isAdmin
          ? "To add or change a key, ask in the chat (for example “add my Runway key”). A secure form opens and the key is saved straight to the encrypted server store — it's never shown here or sent to the browser."
          : "Only an administrator can add service keys."}
      </p>
      {st.isError && <p className="mt-3 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">Couldn't check services: {(st.error as Error).message}</p>}
      {st.isLoading ? <Skeleton className="mt-4 h-60 rounded-2xl" /> : st.data && groups.map((g) => (
        <div key={g} className="mt-5">
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{g}</h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {st.data.integrations.filter((i) => i.group === g).map((i) => (
              <div key={i.id} className={cn("rounded-2xl border bg-card p-4 text-sm", !i.configured && "border-dashed")}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{i.name}</p>
                  {i.configured
                    ? <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success"><CheckCircle2 className="size-3" />Connected</span>
                    : <span className="flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium"><TriangleAlert className="size-3" />Not connected</span>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{i.configured ? (i.detail ?? i.note) : i.id === "exchange_rates" ? i.note : `${CONNECT_TO_ENABLE} ${i.note}`}</p>
                {!i.configured && i.secrets.length > 0 && (
                  <p className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground"><KeyRound className="size-3" />Needs: {i.secrets.map((s) => <code key={s} className="rounded bg-muted px-1">{s}</code>)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
