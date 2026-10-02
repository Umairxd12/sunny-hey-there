import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatusBadge } from "@/components/studio/ui";
import { PROVIDERS } from "@/lib/providers";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/providers")({
  head: () => pageHead("AI Providers", "AI services that power your studio."),
  component: () => (
    <>
      <PageHeader title="AI providers" description="Services that write, generate and publish. Keys are always stored securely on the server." />
      <div className="grid gap-4 md:grid-cols-2">
        {PROVIDERS.filter((p) => p.category !== "social").map((p) => (
          <div key={p.id} className="rounded-2xl border bg-card p-6">
            <div className="flex items-center justify-between"><h3 className="font-semibold">{p.name}</h3><StatusBadge status={p.status} /></div>
            <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>
            <p className="mt-4 text-xs text-muted-foreground">{p.needs}</p>
          </div>
        ))}
      </div>
    </>
  ),
});
