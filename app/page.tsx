"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/http";
import { Heatmap } from "@/components/Heatmap";
import { scoreClass } from "@/components/Pieces";
import {
  CATEGORY_META,
  averageScore,
  bucketByDay,
  currentStreak,
  longestStreak,
  type ActivityEvent,
} from "@/lib/activity";

function relative(at: string): string {
  const diff = Date.now() - new Date(at).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function HomePage() {
  const router = useRouter();
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [degraded, setDegraded] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ events: ActivityEvent[]; degraded?: string[]; missing?: string[] }>(
          "/api/dashboard"
        );
        setEvents(res.events ?? []);
        setDegraded(res.degraded ?? []);
        setMissing(res.missing ?? []);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load your progress");
        setEvents([]);
      }
    })();
  }, []);

  const days = useMemo(() => bucketByDay(events ?? []), [events]);
  const dayKeys = useMemo(() => new Set(days.keys()), [days]);

  const stats = useMemo(() => {
    const list = events ?? [];
    return {
      sessions: list.length,
      avg: averageScore(list),
      streak: currentStreak(dayKeys),
      best: longestStreak(dayKeys),
      activeDays: dayKeys.size,
    };
  }, [events, dayKeys]);

  const byCategory = useMemo(() => {
    const list = events ?? [];
    return CATEGORY_META.map((meta) => {
      const mine = list.filter((e) => e.category === meta.key);
      const avg = averageScore(mine);
      const last = mine[0] ?? null;
      return { meta, attempts: mine.length, avg, last };
    });
  }, [events]);

  const loading = events === null;

  return (
    <>
      <div className="hero">
        <div>
          <div className="eyebrow">Dashboard</div>
          <h1>Your progress</h1>
          <p className="sub">
            Every rep across behavioral, technical and case prep — scored, tracked and kept honest.
          </p>
        </div>
        <div className="row wrap no-print">
          <Link href="/cases">
            <button className="primary">Start a case</button>
          </Link>
          <Link href="/drill">
            <button>Quick drill</button>
          </Link>
        </div>
      </div>

      {err && (
        <div className="callout error" style={{ marginBottom: "var(--s5)" }}>
          <h4>Couldn&apos;t load your progress</h4>
          <p>{err}</p>
        </div>
      )}
      {degraded.length > 0 && (
        <div className="callout error" style={{ marginBottom: "var(--s5)" }}>
          <h4>Some sources didn&apos;t load</h4>
          <p>{degraded.join(" · ")}. Everything else below is up to date.</p>
        </div>
      )}
      {missing.length > 0 && (
        <div className="callout" style={{ marginBottom: "var(--s5)" }}>
          <h4>Not set up yet: {missing.join(", ")}</h4>
          <p>
            Those tables don&apos;t exist in Supabase, so nothing can be recorded against them. Run the matching
            section of <span className="mono">supabase/schema.sql</span> to enable them — the rest of the dashboard
            is unaffected.
          </p>
        </div>
      )}

      <div className="stack loose">
        {/* ---- headline stats ---- */}
        <div className="statgrid">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div className="stat" key={i}>
                  <div className="skel skel-line w-60" />
                  <div className="skel skel-line w-40" style={{ height: 24, marginTop: 10 }} />
                </div>
              ))
            : [
                { k: "Sessions", v: stats.sessions, d: `across ${stats.activeDays} day${stats.activeDays === 1 ? "" : "s"}` },
                { k: "Average score", v: stats.avg ?? "—", unit: stats.avg != null ? "/100" : "", d: "all graded attempts" },
                { k: "Current streak", v: stats.streak, unit: stats.streak === 1 ? " day" : " days", d: `best ${stats.best}` },
                { k: "Active days", v: stats.activeDays, d: "all time" },
              ].map((s) => (
                <div className="stat" key={s.k}>
                  <div className="k">{s.k}</div>
                  <div className="v">
                    {s.v}
                    {s.unit && <span className="unit">{s.unit}</span>}
                  </div>
                  <div className="d">{s.d}</div>
                </div>
              ))}
        </div>

        {/* ---- activity heatmap ---- */}
        <div className="card">
          <div className="section-head">
            <h2>Practice activity</h2>
            <span className="sub">Hover any day for the breakdown</span>
          </div>
          {loading ? <div className="skel skel-block" style={{ height: 120 }} /> : <Heatmap days={days} />}
        </div>

        {/* ---- score by category ---- */}
        <div>
          <div className="section-head">
            <h2>By category</h2>
            <span className="sub">Where you&apos;re strong and where you&apos;re not</span>
          </div>
          <div className="catgrid">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div className="card" key={i}>
                    <div className="skel skel-line w-40" />
                    <div className="skel skel-line w-80" />
                    <div className="skel skel-line w-60" />
                  </div>
                ))
              : byCategory.map(({ meta, attempts, avg, last }) => {
                  const isUpcoming = meta.upcoming && attempts === 0;
                  return (
                    <div
                      className={`card catcard interactive${attempts === 0 ? " empty-cat" : ""}`}
                      key={meta.key}
                      onClick={() => router.push(meta.href)}
                    >
                      <div className="top">
                        <span className="name">{meta.label}</span>
                        <div className="spacer" />
                        {isUpcoming ? (
                          <span className="chip accent">Coming next</span>
                        ) : (
                          <span className="chip">{attempts} rep{attempts === 1 ? "" : "s"}</span>
                        )}
                      </div>
                      <div className="score">
                        {avg != null ? (
                          <span className={scoreClass(avg)}>{avg}</span>
                        ) : (
                          <span>—</span>
                        )}
                        {avg != null && <span className="unit">/100</span>}
                      </div>
                      <div className="track">
                        <div className="fill" style={{ width: `${avg ?? 0}%` }} />
                      </div>
                      <div className="meta">
                        {isUpcoming
                          ? "Not built yet"
                          : last
                            ? `Last: ${last.title} · ${relative(last.at)}`
                            : meta.blurb}
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>

        {/* ---- recent activity ---- */}
        <div className="card">
          <div className="section-head">
            <h2>Recent activity</h2>
            <div className="spacer" />
            <Link href="/archive" className="sub">
              Full archive →
            </Link>
          </div>
          {loading ? (
            <>
              <div className="skel skel-line w-80" />
              <div className="skel skel-line w-60" />
              <div className="skel skel-line w-40" />
            </>
          ) : (events?.length ?? 0) === 0 ? (
            <div className="empty">
              <strong>Nothing here yet</strong>
              Generate a case or run a paper LBO drill and it&apos;ll show up here.
            </div>
          ) : (
            <div className="feed">
              {(events ?? []).slice(0, 8).map((e) => (
                <div
                  className={`feed-item${e.href ? " clickable" : ""}`}
                  key={`${e.category}-${e.id}`}
                  onClick={() => e.href && router.push(e.href)}
                >
                  <span className="chip">{CATEGORY_META.find((c) => c.key === e.category)?.label ?? e.category}</span>
                  <span className="who">
                    <span className="t">{e.title}</span>
                    <span className="m">
                      {e.detail} · {relative(e.at)}
                    </span>
                  </span>
                  {e.score != null ? (
                    <span className={`scorepill ${scoreClass(e.score)}`}>{e.score}</span>
                  ) : (
                    <span className="sub">—</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
