import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, type ProjectStatus } from "@/lib/pipeline";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground"><Icon className="size-5" /></div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  done: { label: "Done", cls: "bg-success/15 text-success" },
  running: { label: "Running", cls: "bg-primary/15 text-primary" },
  failed: { label: "Failed", cls: "bg-destructive/15 text-destructive" },
  pending: { label: "Waiting", cls: "bg-muted text-muted-foreground" },
  queued: { label: "Queued for video worker", cls: "bg-primary/15 text-primary" },
  blocked: { label: "Not connected", cls: "bg-warning/20 text-foreground" },
  connected: { label: "Connected", cls: "bg-success/15 text-success" },
  not_connected: { label: "Not connected", cls: "bg-warning/20 text-foreground" },
  draft: { label: "Draft", cls: "bg-muted text-muted-foreground" },
  in_production: { label: "In production", cls: "bg-primary/15 text-primary" },
  active: { label: "Active", cls: "bg-success/15 text-success" },
  inactive: { label: "Inactive", cls: "bg-muted text-muted-foreground" },
  disabled: { label: "Disabled", cls: "bg-muted text-muted-foreground" },
  READY: { label: "Ready", cls: "bg-accent text-accent-foreground" },
  SCHEDULED: { label: "Scheduled", cls: "bg-primary/15 text-primary" },
  PROCESSING: { label: "Processing", cls: "bg-primary/15 text-primary" },
  PUBLISHING: { label: "Publishing", cls: "bg-primary/25 text-primary" },
  PUBLISHED: { label: "Published", cls: "bg-success/15 text-success" },
  RETRYING: { label: "Retrying", cls: "bg-warning/20 text-foreground" },
};

export function StatusBadge({ status }: { status: string }) {
  const project = STATUS_LABEL[status as ProjectStatus];
  const s = STATUS[status] ?? (project
    ? { label: project, cls: status === "COMPLETED" ? "bg-success/15 text-success" : status === "FAILED" ? "bg-destructive/15 text-destructive" : status === "DRAFT" ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary" }
    : { label: status, cls: "bg-muted text-muted-foreground" });
  return <Badge variant="secondary" className={cn("border-0 font-medium", s.cls)}>{s.label}</Badge>;
}

export function StatCard({ label, value, hint, icon: Icon }: { label: string; value: ReactNode; hint?: string | undefined; icon: LucideIcon }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between text-sm text-muted-foreground">{label}<Icon className="size-4" /></div>
      <div className="mt-2 font-display text-3xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Friendly route-level crash screen: retry in place instead of a dead page.
 *  Shows the error message so a repeat failure can be reported precisely. */
export function RouteErrorFallback({ error, reset }: { error: unknown; reset: () => void }) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border bg-card p-8 text-center">
      <h1 className="text-xl font-semibold">Ye page load nahi ho saka</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Kuch garbar ho gayi. Neeche button dabao — theek ho jana chahiye.
        Agar dobara yehi aaye to neeche wala error text note karke batao.
      </p>
      {message && (
        <p className="mt-3 break-words rounded-xl bg-muted p-3 text-left text-xs text-muted-foreground">{message}</p>
      )}
      <div className="mt-4 flex justify-center gap-2">
        <Button onClick={reset}>Dobara try karein</Button>
        <Button variant="outline" asChild><Link to="/">Home</Link></Button>
      </div>
    </div>
  );
}
