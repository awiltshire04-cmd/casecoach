"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { browserClient } from "@/lib/supabase";
import { apiFetch } from "@/lib/http";
import { scoreClass } from "@/components/Pieces";
import { CASE_TYPES } from "@/lib/types";
import { TOGGLES } from "@/lib/modeltest/types";

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

interface MtRow {
  id: string;
  opened_at: string;
  status: string;
  time_taken_sec: number | null;
  total: number | null;
  company: string;
  concepts: string[];
  difficulty: string;
  presentation: string;
  industry: string;
}

export default function ArchivePage() {
  const router = useRouter();
  const [rows, setRows] = useState<HistRow[]>([]);
  const [mtRows, setMtRows] = useState<MtRow[]>([]);
  const [mtError, setMtError] = useState<string | null>(null);
  const [mtConceptFilter, setMtConceptFilter] = useState<string[]>([]);
  const [mtSortDir, setMtSortDir] = useState<1 | -1>(-1);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
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
        const { data, error: histErr } = await supa
          .from("attempt_history")
          .select("*")
          .order("created_at", { ascending: true });
        if (histErr) throw histErr;
        setRows((data as HistRow[]) ?? []);
        // Served by the service role: the model-test tables have RLS on with no
        // policies, so an anon read here silently returns zero rows.
        try {
          const { rows: mts } = await apiFetch<{ rows: MtRow[] }>("/api/modeltest-archive");
          setMtRows(mts ?? []);
        } catch (e) {
          setMtError(e instanceof Error ? e.message : "Could not load model tests");
        }
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
      } catch (e) {
        const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "Unknown error";
        setFetchError(msg);
        console.error("Archive fetch failed:", e);
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
      const json = await apiFetch<{ insights?: Insight[]; note?: string }>("/api/trend-insights", { method: "POST" });
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
        <div className="eyebrow">Archive</div>
        <h1>Your reps</h1>
        <p className="sub">Every attempt, scored and timed. Slice the trend to find where you lag.</p>
      </div>

      {fetchError && (
        <div className="callout error" style={{ marginBottom: "1.2rem" }}>
          <h4>Couldn't load your archive</h4>
          <p>
            {fetchError}
          </p>
          <p style={{ marginTop: "0.4rem" }}>
            This means the Supabase connection failed, not that your data is missing — check it directly in the Supabase
            Table Editor. If the message above mentions "env vars missing," your Vercel environment variables aren't
            reaching this deployment; if it mentions "Invalid API key" or a 401, the key value itself doesn't match
            what Supabase has on file.
          </p>
        </div>
      )}

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
                  <Line type="monotone" dataKey="score" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3, fill: "#1d4ed8" }} name="AI score" />
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
                    <tr key={r.id} className="clickable" onClick={() => router.push(`/archive/case/${r.id}`)}>
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

      {/* ---- Model Tests ---- */}
      <div className="stack" style={{ marginTop: "2rem" }}>
        <div>
          <h2>Model Tests</h2>
          <p className="sub">Every generated modelling test. Click a row to reopen it read-only, re-download the case PDF, or pull your submitted workbook.</p>
        </div>
        {mtError ? (
          <div className="callout error">
            <h4>Couldn&apos;t load your model tests</h4>
            <p>{mtError}</p>
          </div>
        ) : mtRows.length === 0 ? (
          <div className="empty">No modelling tests yet — generate one from the Model Test tab.</div>
        ) : (
          <>
            <div className="row wrap no-print">
              {Array.from(new Set(mtRows.flatMap((m) => m.concepts))).sort().map((k) => {
                const on = mtConceptFilter.includes(k);
                return (
                  <button
                    key={k}
                    className={`chip${on ? " blue" : ""}`}
                    style={{ cursor: "pointer" }}
                    onClick={() => setMtConceptFilter((f) => (on ? f.filter((x) => x !== k) : [...f, k]))}
                  >
                    {TOGGLES.find((t) => t.key === k)?.label ?? k}
                  </button>
                );
              })}
              {mtConceptFilter.length > 0 && (
                <button className="ghost" onClick={() => setMtConceptFilter([])}>Clear</button>
              )}
            </div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="data">
                <thead>
                  <tr>
                    <th onClick={() => setMtSortDir((d) => (d === 1 ? -1 : 1))}>Date {mtSortDir === -1 ? "↓" : "↑"}</th>
                    <th>Company</th>
                    <th>Industry</th>
                    <th>Difficulty</th>
                    <th>Format</th>
                    <th>Concepts</th>
                    <th>Time</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {mtRows
                    .filter((m) => mtConceptFilter.length === 0 || mtConceptFilter.every((k) => m.concepts.includes(k)))
                    .sort((a, b) => mtSortDir * (new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime()))
                    .map((m) => (
                      <tr key={m.id} className="clickable" onClick={() => router.push(`/archive/mt/${m.id}`)}>
                        <td className="fig">{new Date(m.opened_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
                        <td>{m.company}</td>
                        <td>{m.industry}</td>
                        <td>{m.difficulty}</td>
                        <td>{m.presentation === "cim" ? "CIM" : "Direct"}</td>
                        <td>
                          <span className="sub">{m.concepts.length} selected</span>
                        </td>
                        <td className="fig">{m.time_taken_sec != null ? `${Math.floor(m.time_taken_sec / 60)}m` : "—"}</td>
                        <td className="fig">
                          {m.total != null ? <span className={`scorepill ${scoreClass(m.total)}`}>{m.total}</span> : <span className="sub">{m.status}</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
