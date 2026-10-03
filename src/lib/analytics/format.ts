export type Preset = "today" | "7d" | "30d" | "month" | "last_month" | "custom";

export function rangeFor(p: Preset, custom: { from: string; to: string }) {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let from: Date, to = now;
  switch (p) {
    case "today": from = startOfDay(now); break;
    case "7d": from = new Date(now.getTime() - 7 * 86400_000); break;
    case "month": from = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case "last_month": from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case "custom":
      if (custom.from && custom.to) { from = new Date(`${custom.from}T00:00:00`); to = new Date(`${custom.to}T23:59:59`); break; }
      from = new Date(now.getTime() - 30 * 86400_000); break;
    default: from = new Date(now.getTime() - 30 * 86400_000);
  }
  // Round to the minute so the query key stays stable between renders.
  const r = (d: Date) => new Date(Math.floor(d.getTime() / 60000) * 60000).toISOString();
  return { from: r(from), to: r(to) };
}

export const fmtNum = (n: number | null | undefined) => (n == null ? "—" : new Intl.NumberFormat("en-US", { notation: n >= 100000 ? "compact" : "standard" }).format(n));
export const fmtPct = (n: number | null | undefined) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);
export const fmtMoney = (n: number | null | undefined, currency = "USD") => (n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n));

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} minute${Math.floor(s / 60) === 1 ? "" : "s"} ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hour${Math.floor(s / 3600) === 1 ? "" : "s"} ago`;
  return `${Math.floor(s / 86400)} day${Math.floor(s / 86400) === 1 ? "" : "s"} ago`;
}
