// Shared vocabulary for the Home dashboard. Every practice surface reports the
// same event shape so scores, streaks and the heatmap have one source of truth.

export type ActivityCategory = "case" | "model" | "drill" | "behavioral" | "technical";

export interface ActivityEvent {
  id: string;
  category: ActivityCategory;
  title: string;
  detail: string;
  /** 0-100, or null when the attempt was never graded. */
  score: number | null;
  /** ISO timestamp. */
  at: string;
  /** Where clicking through goes, when there's a detail view. */
  href: string | null;
}

export const CATEGORY_META: {
  key: ActivityCategory;
  label: string;
  blurb: string;
  href: string;
  /** Sections still being built show as upcoming rather than as a zero score. */
  upcoming?: boolean;
}[] = [
  { key: "behavioral", label: "Behavioral", blurb: "Story and delivery", href: "/behavioral" },
  { key: "technical", label: "Technical", blurb: "PE concepts and mechanics", href: "/technical" },
  { key: "case", label: "Case Practice", blurb: "Timed written cases", href: "/cases" },
  { key: "model", label: "Model Test", blurb: "Excel LBO builds", href: "/modeltest" },
  { key: "drill", label: "Paper LBO", blurb: "Returns math drills", href: "/drill" },
];

/** Local-time YYYY-MM-DD. The heatmap is a calendar, so it must use the
 *  viewer's timezone rather than UTC — a 9pm PST session is still "today". */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export interface DayBucket {
  key: string;
  total: number;
  byCategory: Partial<Record<ActivityCategory, number>>;
}

export function bucketByDay(events: ActivityEvent[]): Map<string, DayBucket> {
  const map = new Map<string, DayBucket>();
  for (const e of events) {
    const at = new Date(e.at);
    if (Number.isNaN(at.getTime())) continue;
    const key = dayKey(at);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { key, total: 0, byCategory: {} };
      map.set(key, bucket);
    }
    bucket.total += 1;
    bucket.byCategory[e.category] = (bucket.byCategory[e.category] ?? 0) + 1;
  }
  return map;
}

/** Consecutive days ending today (or yesterday — an unfinished today shouldn't
 *  read as a broken streak). */
export function currentStreak(days: Set<string>, today = new Date()): number {
  const cursor = new Date(today);
  if (!days.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(dayKey(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function longestStreak(days: Set<string>): number {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const key of sorted) {
    const d = parseDayKey(key);
    if (prev && Math.round((d.getTime() - prev.getTime()) / 86400000) === 1) run += 1;
    else run = 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function averageScore(events: ActivityEvent[]): number | null {
  const scored = events.filter((e) => typeof e.score === "number") as (ActivityEvent & { score: number })[];
  if (!scored.length) return null;
  return Math.round(scored.reduce((a, e) => a + e.score, 0) / scored.length);
}
