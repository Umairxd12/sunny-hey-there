// Pure scheduling helpers (safe for browser and server).
export const POST_STATUSES = ["DRAFT", "READY", "SCHEDULED", "PROCESSING", "PUBLISHING", "PUBLISHED", "FAILED", "RETRYING"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const COUNTRIES = [{ code: "US", name: "United States", language: "American English" }] as const;

export interface ScheduleRule {
  timezone: string;
  frequency: "daily" | "specific_days" | "custom";
  days_of_week: number[]; // 0 = Sunday
  publish_times: string[]; // "HH:MM" in timezone
  custom_slots: string[]; // ISO timestamps
}

function partsIn(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday!);
  return { y: +p.year!, m: +p.month!, d: +p.day!, h: +p.hour!, mi: +p.minute!, s: +p.second!, wd };
}

/** Converts a wall-clock time in `tz` to a real instant. */
export function zonedTimeToUtc(y: number, m: number, d: number, h: number, mi: number, tz: string): Date {
  let guess = Date.UTC(y, m - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const p = partsIn(new Date(guess), tz);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    guess += Date.UTC(y, m - 1, d, h, mi) - asUtc;
  }
  return new Date(guess);
}

/** Returns the next publishing slot strictly after `after`, skipping `taken` instants. */
export function nextSlot(rule: ScheduleRule, after: Date = new Date(), taken: number[] = []): Date | null {
  const free = (t: Date) => t.getTime() > after.getTime() && !taken.some((x) => Math.abs(x - t.getTime()) < 60_000);
  if (rule.frequency === "custom") {
    return rule.custom_slots.map((s) => new Date(s)).filter(free).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  }
  const times = [...rule.publish_times].filter((t) => /^\d{2}:\d{2}$/.test(t)).sort();
  if (!times.length) return null;
  const start = partsIn(after, rule.timezone);
  for (let i = 0; i < 60; i++) {
    const day = new Date(Date.UTC(start.y, start.m - 1, start.d + i));
    const wd = day.getUTCDay();
    if (rule.frequency === "specific_days" && !rule.days_of_week.includes(wd)) continue;
    for (const t of times) {
      const [h, mi] = t.split(":").map(Number) as [number, number];
      const at = zonedTimeToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, mi, rule.timezone);
      if (free(at)) return at;
    }
  }
  return null;
}

export function formatInZone(iso: string | null, tz: string, part: "date" | "time") {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", part === "date" ? { timeZone: tz, weekday: "short", month: "short", day: "numeric", year: "numeric" } : { timeZone: tz, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
}
