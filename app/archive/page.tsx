"use client";
import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { browserClient } from "@/lib/supabase";
import { scoreClass } from "@/components/Pieces";
import { CASE_TYPES } from "@/lib/types";

interface HistRow {
  id: string;
  created_at: string;
  ai_score: number;
  self_score: number | null;
  calibration_gap: number | null;
  time_allotted_sec: number;
  time_taken_sec: number;
  type: string;
  industry: string;
  difficulty: string;
  title: string;
}
interface Insight {
  kind: "weakness" | "strength";
  title: string;
  body: string;
}

type SliceKey = "all" | "type" | "industry" | "difficulty";

export default function ArchivePage() {
  const [rows, setRows] = useState<HistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [slice, setSlice] = useState<SliceKey>("all");
  const [sliceVal, setSliceVal] = useState<string>("");
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [insightNote, setInsightNote] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [missedTraps, setMissedTraps] = useState<{ type: string; trap: string; times_missed: number }[]>([]);
  const [sortKey, setSortKey] = useState<keyof HistRow>("created_at");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  useEffect(() => {
    (async () => {
      try {
        const supa = browserClient();
        const { data } = await supa
          .from("attempt_history")
          .select("*")
          .order("created_at", { ascending: true });
        setRows((data as HistRow[]) ?? []);
        try {
          const { data: traps } = await supa
            .from("missed_trap_frequency")
            .select("type, trap, times_missed")
            .order("times_missed", { ascending: false })
            .limit(6);
          setMissedTraps((traps as typeof missedTraps) ?? []);
        } catch {
          /* view may not exist on older installs */
        }
      } catch {
        /* env not set */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sliceValues = useMemo(() => {
    if (slice === "all") return [];
    const key = slice as keyof HistRow;
    return Array.from(new Set(rows.map((r) => String(r[key])))).sort();
  }, [slice, rows]);

  const chartData = useMemo(() => {
    let filtered = rows;
    if (slice !== "all" && sliceVal) {
      filtered = rows.filter((r) => String(r[slice as keyof HistRow]) === sliceVal);
    }
    return filtered.map((r, i) => ({
      i: i + 1,
      score: r.ai_score,
      self: r.self_score ?? null,
      date: new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    }));
  }, [rows, slice, sliceVal]);

  const avg = chartData.length ? Math.round(chartData.reduce((a, b) => a + b.score, 0) / chartData.length) : 0;

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function setSort(k: keyof HistRow) {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(-1);
    }
  }

  async function runInsights() {
    setLoadingInsights(true);
    setInsightNote(null);
    try {
      const res = await fetch("/api/trend-insights", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setInsights(json.insights ?? []);
      if (json.note) setInsightNote(json.note);
    } catch (e) {
      setInsightNote(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoadingInsights(false);
    }
  }

  const typeLabel = (t: string) => CASE_TYPES.find((x) => x.value === t)?.label ?? t;

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">03 · Archive</div>
        <h1>Your reps</h1>
        <p className="sub">Every attempt, scored and timed. Slice the trend to find where you lag.</p>
      </div>

      {loading ? (
        <div className="empty">
          <span className="spin" /> loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="empty">No attempts yet. Complete a case to populate your archive.</div>
      ) : (
        <div className="stack">
         <div className="split-3">
          {/* chart */}
          <div className="card stack">
            <div className="row wrap">
              <h3>Score history</h3>
              <div className="spacer" />
              <select
                value={slice}
                onChange={(e) => {
                  setSlice(e.target.value as SliceKey);
                  setSliceVal("");
                }}
              >
                <option value="all">All attempts</option>
                <option value="type">By case type</option>
                <option value="industry">By industry</option>
                <option value="difficulty">By difficulty</option>
              </select>
              {slice !== "all" && (
                <select value={sliceVal} onChange={(e) => setSliceVal(e.target.value)}>
                  <option value="">Choose…</option>
                  {sliceValues.map((v) => (
                    <option key={v} value={v}>
                      {slice === "type" ? typeLabel(v) : v}
                    </option>
                  ))}
                </select>
              )}
              <span className="chip blue">avg {avg}</span>
            </div>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
                  <CartesianGrid stroke="#eef2f6" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 5, border: "1px solid #e2e8f0", fontFamily: "JetBrains Mono, monospace" }}
                  />
                  <ReferenceLine y={avg} stroke="#94a3b8" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2} dot={{ r: 3, fill: "#2563eb" }} name="AI score" />
                  <Line type="monotone" dataKey="self" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="Self score" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* right column: traps you keep missing */}
          <div className="card stack">
            <h3>Traps you keep missing</h3>
            {missedTraps.length === 0 ? (
              <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>
                Nothing recurring yet. Missed insights from graded cases surface here and get re-tested in new cases.
              </p>
            ) : (
              <div>
                {missedTraps.map((t, i) => (
                  <div className="trap" key={i}>
                    <span className="count">{t.times_missed}×</span>
                    <span className="txt">
                      <span className="chip" style={{ marginRight: 6 }}>{typeLabel(t.type)}</span>
                      {t.trap}
                    </span>
                  </div>
                ))}
                <p style={{ fontSize: "0.76rem", color: "var(--faint)", marginTop: "0.6rem" }}>
                  New cases of these types are nudged to re-test these.
                </p>
              </div>
            )}
          </div>
         </div>

          {/* insights (full width) */}
          <div className="card stack">
            <div className="row">
              <h3>Trend insights</h3>
              <div className="spacer" />
              <button onClick={runInsights} disabled={loadingInsights}>
                {loadingInsights ? (
                  <>
                    <span className="spin" /> &nbsp;Analyzing…
                  </>
                ) : (
                  "Analyze weaknesses"
                )}
              </button>
            </div>
            {insightNote && <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>{insightNote}</p>}
            <div className="split">
              {insights?.map((ins, i) => (
                <div className="callout" key={i} style={{ borderLeftColor: ins.kind === "strength" ? "var(--good)" : "var(--blue)" }}>
                  <h4>
                    {ins.kind === "strength" ? "✓ " : "△ "}
                    {ins.title}
                  </h4>
                  <p>{ins.body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* table */}
          <div className="card">
            <table className="data">
              <thead>
                <tr>
                  <th onClick={() => setSort("created_at")}>Date</th>
                  <th onClick={() => setSort("title")}>Case</th>
                  <th onClick={() => setSort("type")}>Type</th>
                  <th onClick={() => setSort("industry")}>Industry</th>
                  <th onClick={() => setSort("difficulty")}>Diff</th>
                  <th onClick={() => setSort("time_taken_sec")}>Time</th>
                  <th onClick={() => setSort("ai_score")}>Score</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const mins = Math.floor(r.time_taken_sec / 60);
                  const secs = r.time_taken_sec % 60;
                  return (
                    <tr key={r.id}>
                      <td className="fig">{new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
                      <td>{r.title}</td>
                      <td>{typeLabel(r.type)}</td>
                      <td>{r.industry}</td>
                      <td>{r.difficulty}</td>
                      <td className="fig">
                        {mins}:{String(secs).padStart(2, "0")}
                      </td>
                      <td className="fig">
                        <span className={`scorepill ${scoreClass(r.ai_score)}`}>{r.ai_score}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
