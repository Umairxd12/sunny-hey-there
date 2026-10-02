import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, StatusBadge } from "@/components/studio/ui";
import { getEngineStatus } from "@/lib/pipeline.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/providers")({
  head: () => pageHead("AI Providers", "AI services that power your studio."),
  component: ProvidersPage,
});

function ProvidersPage() {
  const fetchStatus = useServerFn(getEngineStatus);
  const { data } = useQuery({ queryKey: ["engine-status"], queryFn: () => fetchStatus() });
  return (
    <>
      <PageHeader title="AI providers" description="Each production capability uses its own provider. Keys are stored securely on the server and never reach the browser." />
      <div className="grid gap-4 md:grid-cols-2">
        {data?.providers.map((p) => (
          <div key={p.capability} className="rounded-2xl border bg-card p-6">
            <div className="flex items-center justify-between"><h3 className="font-semibold">{p.label}</h3><StatusBadge status={p.configured ? "connected" : "not_connected"} /></div>
            <p className="mt-1 text-sm">{p.providerName ?? "No provider connected"}</p>
            <p className="mt-3 text-xs text-muted-foreground">{p.note}</p>
          </div>
        ))}
      </div>
    </>
  );
}
