import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatusBadge } from "@/components/studio/ui";
import { Button } from "@/components/ui/button";
import { PROVIDERS } from "@/lib/providers";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/social")({
  head: () => pageHead("Social Accounts", "Connect Facebook, YouTube and TikTok."),
  component: () => (
    <>
      <PageHeader title="Social accounts" description="Connect where your videos get published. Sign-in with each platform is added in the publishing phase." />
      <div className="grid gap-4 md:grid-cols-3">
        {PROVIDERS.filter((p) => p.category === "social").map((p) => (
          <div key={p.id} className="flex flex-col rounded-2xl border bg-card p-6">
            <div className="flex items-center justify-between"><h3 className="font-semibold">{p.name}</h3><StatusBadge status={p.status} /></div>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">{p.description}</p>
            <p className="mt-4 text-xs text-muted-foreground">Needs: {p.needs}</p>
            <Button className="mt-4" variant="outline" disabled>Connect (coming next)</Button>
          </div>
        ))}
      </div>
    </>
  ),
});
