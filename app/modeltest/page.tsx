"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { INDUSTRIES } from "@/lib/types";
import { apiFetch, postJson } from "@/lib/http";
import { TOGGLES, TEST_TIME_BENCH, type GradeBreakdown, type TestDifficulty } from "@/lib/modeltest/types";

type Phase = "setup" | "generating" | "run" | "grading" | "graded";
interface Page { title: string; body: string }
interface Quirk { id: string; title: string; mechanic: string }

const DIFF_DEFAULTS: Record<TestDifficulty, string[]> = {
  level3: ["driver_forecast", "closing_bs", "revolver_sweep", "fee_treatment"],
  level4: ["driver_forecast", "closing_bs", "revolver_sweep", "multi_tranche", "fee_treatment", "nwc_days", "recap", "circularity"],
  level5: ["driver_forecast", "closing_bs", "revolver_sweep", "multi_tranche", "fee_treatment", "nwc_days", "addon", "convertible_preferred", "mgmt_options", "circularity"],
};

function fmtClock(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h > 0 ? `${h}:` : "") + `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function ModelTestPage() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [error, setError] = useState<string | null>(null);

  // setup
  const [difficulty, setDifficulty] = useState<TestDifficulty>("level4");
  const [industry, setIndustry] = useState<string>("Random");
  const [resolvedIndustry, setResolvedIndustry] = useState<string>("");
  const [hold, setHold] = useState(5);
  const [presentation, setPresentation] = useState<"direct" | "cim">("direct");
  const [concepts, setConcepts] = useState<string[]>(DIFF_DEFAULTS.level4);

  // run
  const [testId, setTestId] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [pages, setPages] = useState<Page[]>([]);
  const [pageIdx, setPageIdx] = useState(0);
  const [quirks, setQuirks] = useState<Quirk[]>([]);
  const [hints, setHints] = useState<Record<string, string>>({});
  const [hintLoading, setHintLoading] = useState<string | null>(null);
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [writeup, setWriteup] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // graded
  const [grade, setGrade] = useState<GradeBreakdown | null>(null);

  useEffect(() => {
    if (phase !== "run" || openedAt == null) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - openedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase, openedAt]);

  const setDiff = (d: TestDifficulty) => {
    setDifficulty(d);
    setConcepts(DIFF_DEFAULTS[d]);
  };
  const toggle = (key: string) =>
    setConcepts((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));

  const generate = async () => {
    setError(null);
    setPhase("generating");
    try {
      const picked = industry === "Random" ? INDUSTRIES[Math.floor(Math.random() * INDUSTRIES.length)] : industry;
      setResolvedIndustry(picked);
      const data = await postJson<{ id: string; pages: Page[]; quirks?: Quirk[]; company: string }>(
        "/api/modeltest-generate",
        { concepts, hold_years: hold, difficulty, industry: picked, presentation }
      );
      setTestId(data.id);
      setPages(data.pages);
      setQuirks(data.quirks ?? []);
      setCompany(data.company);
      setPageIdx(0);
      // open the attempt — timer anchors server-side
      const openData = await postJson<{ attemptId: string; opened_at: string }>("/api/modeltest-submit", {
        action: "open",
        testId: data.id,
      });
      setAttemptId(openData.attemptId);
      setOpenedAt(new Date(openData.opened_at).getTime());
      setElapsed(0);
      setPhase("run");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      setPhase("setup");
    }
  };

  const getHint = async (quirkId: string) => {
    if (hints[quirkId] || !testId) return;
    setHintLoading(quirkId);
    try {
      const data = await postJson<{ hint: string }>("/api/modeltest-hint", { testId, quirkId });
      setHints((h) => ({ ...h, [quirkId]: data.hint }));
    } catch (e) {
      setHints((h) => ({ ...h, [quirkId]: `Hint unavailable: ${e instanceof Error ? e.message : "error"}` }));
    } finally {
      setHintLoading(null);
    }
  };

  const submit = async () => {
    if (!file || !testId || !attemptId) return;
    setError(null);
    setPhase("grading");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("writeup", writeup);
      fd.append("testId", testId);
      fd.append("attemptId", attemptId);
      const data = await apiFetch<{ grade: GradeBreakdown }>("/api/modeltest-submit", { method: "POST", body: fd });
      setGrade(data.grade);
      setPhase("graded");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Grading failed");
      setPhase("run");
    }
  };

  const reset = () => {
    setPhase("setup"); setGrade(null); setTestId(null); setAttemptId(null);
    setPages([]); setQuirks([]); setHints({}); setFile(null); setWriteup("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const basicToggles = useMemo(() => TOGGLES.filter((t) => t.category === "basic"), []);
  const advToggles = useMemo(() => TOGGLES.filter((t) => t.category === "advanced"), []);
  const bench = TEST_TIME_BENCH[difficulty];

  // ---------------------------------------------------------------- render
  if (phase === "setup" || phase === "generating") {
    return (
      <div className="stack">
        <div className="page-head">
          <div>
            <div className="eyebrow">Case Prep · Model Test</div>
            <h1>Modelling Test Trainer</h1>
            <p className="sub">
              Generate a full LBO modelling test, build it in Excel against the clock, then upload the
              workbook for grading against a solver-computed answer key.
            </p>
          </div>
        </div>
        {error && <div className="callout error">{error}</div>}

        <div className="card stack">
          <div className="row wrap">
            <div className="field">
              <label>Difficulty</label>
              <select value={difficulty} onChange={(e) => setDiff(e.target.value as TestDifficulty)}>
                <option value="level3">Level 3 — Clean Fundamentals (~90 Min)</option>
                <option value="level4">Level 4 — PF-Style Full Test (~4 Hrs)</option>
                <option value="level5">Level 5 — Structural Complexity (~4 Hrs)</option>
              </select>
            </div>
            <div className="field">
              <label>Industry</label>
              <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                <option value="Random">Random</option>
                {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Hold period</label>
              <select value={hold} onChange={(e) => setHold(Number(e.target.value))}>
                {[3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} Years</option>)}
              </select>
            </div>
            <div className="field">
              <label>Presentation</label>
              <select value={presentation} onChange={(e) => setPresentation(e.target.value as "direct" | "cim")}>
                <option value="direct">Direct Assumptions (PF Style)</option>
                <option value="cim">CIM — Numbers Buried in Prose</option>
              </select>
            </div>
          </div>

          <div>
            <div className="toggle-group-head">Basic — Peak Frameworks Level 4/5 material</div>
            <div className="toggle-grid">
              {basicToggles.map((t) => (
                <label key={t.key} className={`toggle${concepts.includes(t.key) ? " on" : ""}`}>
                  <input type="checkbox" checked={concepts.includes(t.key)} onChange={() => toggle(t.key)} />
                  <div>
                    <div className="t-label">{t.label}</div>
                    <div className="t-desc">{t.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="toggle-group-head">Advanced — beyond the PF guides</div>
            <div className="toggle-grid">
              {advToggles.map((t) => (
                <label key={t.key} className={`toggle${concepts.includes(t.key) ? " on" : ""}${t.phase === "B" ? " locked" : ""}`}>
                  <input
                    type="checkbox"
                    disabled={t.phase === "B"}
                    checked={concepts.includes(t.key)}
                    onChange={() => toggle(t.key)}
                  />
                  <div>
                    <div className="t-label">{t.label}{t.phase === "B" && <span className="chip">phase 2</span>}</div>
                    <div className="t-desc">{t.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="row">
            <button className="primary" onClick={generate} disabled={phase === "generating"}>
              {phase === "generating" ? "Generating case + solving reference model…" : "Generate Test"}
            </button>
            <span className="sub">Benchmark: {Math.round(bench / 60)} min. The timer starts when the case opens.</span>
          </div>
          {phase === "generating" && <div className="spin" aria-label="loading" />}
        </div>
      </div>
    );
  }

  if (phase === "run" || phase === "grading") {
    const page = pages[pageIdx];
    return (
      <div className="stack">
        <div className="page-head">
          <div>
            <div className="eyebrow">Case Prep · Model Test</div>
            <h1>{company}</h1>
            <p className="sub">{presentation === "cim" ? "Confidential Information Memorandum" : "Modelling Test — Direct Assumptions"} · {resolvedIndustry} · {hold}-Year Hold</p>
          </div>
          <div className="row">
            <span className="timer mono">{fmtClock(elapsed)}</span>
            <button className="no-print" onClick={() => window.print()}>Download PDF</button>
          </div>
        </div>
        {error && <div className="callout error">{error}</div>}

        <div className="mt-split">
          <div className="stack">
            <div className="card">
              <div className="pagenav no-print">
                <button onClick={() => setPageIdx((i) => Math.max(0, i - 1))} disabled={pageIdx === 0}>‹ Prev</button>
                <div className="pagenav-pages">
                  {pages.map((p, i) => (
                    <button key={i} className={`pagechip${i === pageIdx ? " on" : ""}`} onClick={() => setPageIdx(i)} title={p.title}>
                      {i + 1}
                    </button>
                  ))}
                </div>
                <button onClick={() => setPageIdx((i) => Math.min(pages.length - 1, i + 1))} disabled={pageIdx === pages.length - 1}>Next ›</button>
              </div>
              <h2>{page?.title}</h2>
              <div className="case-body body">{page?.body}</div>
            </div>

            <div className="print-only">
              {pages.map((p, i) => (
                <div key={i} className="card" style={{ marginBottom: "1rem" }}>
                  <h2>{p.title}</h2>
                  <div className="case-body body">{p.body}</div>
                </div>
              ))}
            </div>

            <div className="card stack no-print">
              <h3>Submit</h3>
              <div className="row wrap">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file && <span className="chip blue">{file.name}</span>}
              </div>
              <textarea
                rows={7}
                placeholder="Investment write-up: your return profile, whether you'd do the deal at this price, key drivers and risks (tie them to the numbers), and what would change your mind."
                value={writeup}
                onChange={(e) => setWriteup(e.target.value)}
              />
              <div className="row">
                <button className="primary" onClick={submit} disabled={!file || phase === "grading"}>
                  {phase === "grading" ? "Grading — parsing workbook, checking outputs, reviewing formulas…" : "Submit for Grading"}
                </button>
                <button className="ghost" onClick={reset}>Abandon</button>
              </div>
              {phase === "grading" && <div className="spin" aria-label="grading" />}
            </div>
          </div>

          <aside className="stack no-print">
            <div className="card">
              <h3>Quirks in this case</h3>
              <p className="sub">Non-standard mechanics worth reading twice. Hints are case-specific — using one is honest practice, not cheating.</p>
              {quirks.length === 0 && <div className="empty">No structural quirks flagged.</div>}
              {quirks.map((q) => (
                <div key={q.id} className="quirk">
                  <div className="t-label">{q.title}</div>
                  <div className="t-desc">{q.mechanic}</div>
                  {hints[q.id] ? (
                    <div className="hint body">{hints[q.id]}</div>
                  ) : (
                    <button className="ghost" onClick={() => getHint(q.id)} disabled={hintLoading === q.id}>
                      {hintLoading === q.id ? "Thinking…" : "Show Hint"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  // graded
  const g = grade!;
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="eyebrow">Case Prep · Model Test</div>
          <h1>Results — {company}</h1>
        </div>
        <div className="row">
          <button onClick={() => window.print()}>Export PDF</button>
          <button className="primary" onClick={reset}>New Test</button>
        </div>
      </div>

      <div className="card row wrap" style={{ alignItems: "baseline", gap: "2rem" }}>
        <div>
          <div className="eyebrow">TOTAL</div>
          <div className="mono" style={{ fontSize: "2.4rem", color: "var(--blue)" }}>{g.total}</div>
        </div>
        {[
          ["Outputs (45%)", g.outputs.score],
          ["Structure (20%)", g.structure.score],
          ["Concepts (20%)", Math.round(g.concepts.reduce((a, c) => a + ({ correct: 100, partial: 60, incorrect: 20, not_found: 0 } as Record<string, number>)[c.verdict], 0) / Math.max(1, g.concepts.length))],
          ["Write-up (15%)", g.writeup.score],
        ].map(([k, v]) => (
          <div key={String(k)}>
            <div className="eyebrow">{k}</div>
            <div className="mono" style={{ fontSize: "1.5rem" }}>{v}</div>
          </div>
        ))}
        <div>
          <div className="eyebrow">TIME</div>
          <div className="mono" style={{ fontSize: "1.5rem" }}>{fmtClock(g.speed.time_taken_sec)}</div>
          <div className="sub">{g.speed.context}</div>
        </div>
      </div>

      <div className="card">
        <h3>Outputs vs. reference key</h3>
        <table className="check-table">
          <thead><tr><th>Checkpoint</th><th>Reference</th><th>Your model</th><th></th></tr></thead>
          <tbody>
            {g.outputs.checks.map((c) => (
              <tr key={c.label} className={c.pass ? "pass" : "fail"}>
                <td>{c.label}</td>
                <td className="mono">{c.expected}{c.kind === "pct" ? "%" : c.kind === "mult" ? "x" : ""}</td>
                <td className="mono">{c.found == null ? "not found" : `${c.found}${c.kind === "pct" ? "%" : c.kind === "mult" ? "x" : ""}`}</td>
                <td className="mono">{c.pass ? "✓" : "✗"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="sub">A wrong intermediate with a right final answer usually means offsetting errors — check the first failed checkpoint top-down.</p>
      </div>

      <div className="mt-split">
        <div className="card stack">
          <h3>Structure & hygiene</h3>
          <div className="row wrap">
            <span className="chip">{g.structure.formula_cells} formulas</span>
            <span className="chip">{g.structure.hardcoded_numeric} hardcodes ({Math.round(g.structure.hardcode_ratio * 100)}%)</span>
            <span className="chip">{g.structure.error_cells.length} error cells</span>
            <span className="chip">{g.structure.irr_is_formula ? "IRR wired" : "IRR missing"}</span>
            <span className="chip">{g.structure.iterative_calc_enabled == null ? "iter calc unknown" : g.structure.iterative_calc_enabled ? "iterative calc on" : "iterative calc off"}</span>
          </div>
          {g.structure.notes.length > 0 && (
            <ul className="gap-list">{g.structure.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          )}
        </div>
        <div className="card stack">
          <h3>Concept mechanics</h3>
          {g.concepts.map((c) => (
            <div key={c.key} className="concept-row">
              <span className={`verdict ${c.verdict}`}>{c.verdict.replace("_", " ")}</span>
              <div>
                <div className="t-label">{TOGGLES.find((t) => t.key === c.key)?.label ?? c.key}</div>
                <div className="t-desc">{c.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card stack">
        <h3>Write-up</h3>
        {(["numerical", "judgment", "comms"] as const).map((k) => (
          <div key={k}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong style={{ textTransform: "capitalize" }}>{k}</strong>
              <span className="mono">{g.writeup.dimension_scores[k] ?? "—"}</span>
            </div>
            <p className="sub">{g.writeup.feedback[k]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
