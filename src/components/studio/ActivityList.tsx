import { cn } from "@/lib/utils";

export function ActivityList({ items }: { items: { id: string; level: string; event: string; detail: string | null; created_at: string; category: string }[] }) {
  return (
    <ol className="relative space-y-3 border-l pl-5">
      {items.map((x) => (
        <li key={x.id} className="relative text-sm">
          <span className={cn("absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-card",
            x.level === "success" ? "bg-success" : x.level === "error" ? "bg-destructive" : x.level === "warning" ? "bg-warning" : "bg-primary")} />
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-xs text-muted-foreground">{new Date(x.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            <span className="font-medium">{x.event}</span>
            <span className="text-xs text-muted-foreground">{new Date(x.created_at).toLocaleDateString()}</span>
          </div>
          {x.detail && <p className="text-xs text-muted-foreground">{x.detail}</p>}
        </li>
      ))}
    </ol>
  );
}
