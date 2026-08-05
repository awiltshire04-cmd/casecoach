"use client";
import { useEffect, useRef, useState } from "react";
import { fmtTime } from "@/components/Pieces";
import { CHECKED_FIELDS, type LboScenario, type LboAnswers } from "@/lib/lbo";
import { INDUSTRIES } from "@/lib/types";
import { postJson } from "@/lib/http";

type Phase = "idle" | "solving" | "done";
type Difficulty = "easy" | "medium" | "hard";
type GradeResponse = {
  correctness: Record<string, boolean>;
  passed: boolean;
  correct: LboAnswers;
  passCount: number;
  total: number;
};

const DRILL_TIME = 4 * 60; // 4 minutes per drill

export default function DrillPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [drillId, setDrillId] = useState<string | null>(null);
  const [scenario, setScenario] = useState<LboScenario | null>(null);
  const [industry, setIndustry] = useState<string>("Random");
  const [remaining, setRemaining] = useState(DRILL_TIME);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<GradeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const startedAt = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }
  useEffect(() => () => stopTimer(), []);

  async function newDrill() {
    setBusy(true);
    setErr(null);
    setResult(null);
    setInputs({});
    try {
      const json = await postJson<{ drill: { id: string; scenario: LboScenario } }>("/api/lbo-drill", {
        action: "new",
        difficulty,
        industry: industry === "Random" ? INDUSTRIES[Math.floor(Math.random() * INDUSTRIES.length)] : industry,
      });
      setDrillId(json.drill.id);
      setScenario(json.drill.scenario);
      setRemaining(DRILL_TIME);
      setPhase("solving");
      startedAt.current = Date.now();
      stopTimer();
      timerRef.current = setInterval(() => setRemaining((r) => r - 1), 1000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!drillId) return;
    stopTimer();
    setBusy(true);
    try {
      const submitted: Record<string, number> = {};
      for (const f of CHECKED_FIELDS) submitted[f.key] = Number(inputs[f.key]);
      const json = await postJson<GradeResponse>("/api/lbo-drill", {
        action: "grade",
        id: drillId,
        submitted,
        timeTakenSec: Math.round((Date.now() - startedAt.current) / 1000),
      });
      setResult(json);
      setPhase("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Grade failed");
    } finally {
      setBusy(false);
    }
  }

  const timerClass = remaining <= 20 ? "low" : remaining <= 60 ? "mid" : "";
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">03 · Paper LBO</div>
        <h1>Quant Drill</h1>
        <p className="sub">Fast reps on the math that trips people up live. Final answer plus key intermediates, checked to a tolerance.</p>
      </div>

      {phase === "idle" && (
        <div className="card row">
          <label className="field" style={{ maxWidth: 160 }}>
            <span>Difficulty</span>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
              <option value="easy">Easy (Round Numbers)</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard (Messy)</option>
            </select>
          </label>
          <label className="field" style={{ maxWidth: 200 }}>
            <span>Industry</span>
            <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
              <option value="Random">Random</option>
              {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
            </select>
          </label>
          <div className="spacer" />
          <button className="primary" onClick={newDrill} disabled={busy}>
            {busy ? <><span className="spin" /> &nbsp;Loading…</> : "Start Drill"}
          </button>
        </div>
      )}

      {(phase === "solving" || phase === "done") && scenario && (
        <div className="split-3">
          {/* scenario */}
          <div className="card">
            <h3 style={{ marginBottom: "0.2rem" }}>{scenario.company}</h3>
            {scenario.industry && <div className="sub" style={{ marginBottom: "0.5rem" }}>{scenario.industry}</div>}
            <div className="scenario-line"><span className="k">Entry EBITDA</span><span className="v">${scenario.entry_ebitda}M</span></div>
            <div className="scenario-line"><span className="k">Entry multiple</span><span className="v">{scenario.entry_multiple}x</span></div>
            <div className="scenario-line"><span className="k">Leverage at entry</span><span className="v">{scenario.leverage_turns}x EBITDA</span></div>
            <div className="scenario-line"><span className="k">EBITDA growth</span><span className="v">{pct(scenario.ebitda_cagr)}/yr</span></div>
            <div className="scenario-line"><span className="k">Hold period</span><span className="v">{scenario.hold_years} yrs</span></div>
            <div className="scenario-line"><span className="k">Exit multiple</span><span className="v">{scenario.exit_multiple}x</span></div>
            <div className="scenario-line"><span className="k">Debt paydown</span><span className="v">${scenario.annual_fcf_for_paydown}M/yr</span></div>
            <p style={{ fontSize: "0.76rem", color: "var(--faint)", marginTop: "0.7rem" }}>
              Assume no cash sweep beyond the stated paydown; ignore fees and taxes. Compound EBITDA at the stated growth.
            </p>
          </div>

          {/* answers */}
          <div className="card stack">
            <div className="row">
              <span className="chip">{phase === "solving" ? "Time remaining" : "Result"}</span>
              {phase === "solving" ? (
                <div className={`timer ${timerClass}`}>{fmtTime(remaining)}</div>
              ) : result ? (
                <div className="timer" style={{ color: result.passed ? "var(--good)" : "var(--warn)" }}>
                  {result.passCount}/{result.total}
                </div>
              ) : null}
            </div>

            <div className="lbo-grid">
              {CHECKED_FIELDS.map((f) => {
                const state =
                  phase === "done" && result
                    ? result.correctness[f.key]
                      ? "pass"
                      : "fail"
                    : "";
                const truth = result?.correct[f.key];
                const truthLabel =
                  truth == null ? "" : f.kind === "pct" ? `${(truth * 100).toFixed(1)}%` : truth.toString();
                return (
                  <div className={`lbo-field ${state}`} key={f.key}>
                    <label>{f.label}</label>
                    <input
                      type="number"
                      step="any"
                      value={inputs[f.key] ?? ""}
                      disabled={phase === "done"}
                      onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })}
                    />
                    {phase === "done" && !result?.correctness[f.key] && (
                      <span className="truth">✓ {truthLabel}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {err && <p style={{ color: "var(--bad)", fontSize: "0.85rem", margin: 0 }}>{err}</p>}

            <div className="row">
              {phase === "solving" && (
                <button className="primary" onClick={submit} disabled={busy}>
                  {busy ? <><span className="spin" /> &nbsp;Checking…</> : "Check answers"}
                </button>
              )}
              {phase === "done" && (
                <>
                  <button className="primary" onClick={newDrill} disabled={busy}>Next Drill</button>
                  <button onClick={() => setPhase("idle")}>Done</button>
                </>
              )}
            </div>

            {phase === "done" && result && (
              <div className="callout" style={{ borderLeftColor: result.passed ? "var(--good)" : "var(--warn)" }}>
                <h4>{result.passed ? "Clean sheet." : "Worked solution"}</h4>
                <p style={{ fontFamily: "var(--mono)", fontSize: "0.82rem", lineHeight: 1.7 }}>
                  Entry EV = {scenario.entry_ebitda} × {scenario.entry_multiple} = ${result.correct.entry_ev}M ·
                  Entry debt = {scenario.entry_ebitda} × {scenario.leverage_turns} = ${(scenario.entry_ebitda * scenario.leverage_turns).toFixed(0)}M ·
                  Entry equity = ${result.correct.entry_equity}M<br />
                  Exit EBITDA = {scenario.entry_ebitda} × (1+{scenario.ebitda_cagr.toFixed(2)})^{scenario.hold_years} = ${result.correct.exit_ebitda}M ·
                  Exit EV = ${result.correct.exit_ev}M<br />
                  Debt paydown = ${result.correct.debt_paydown}M → exit debt ${result.correct.exit_debt}M ·
                  Exit equity = ${result.correct.exit_equity}M<br />
                  MOIC = {result.correct.moic}x → IRR = {(result.correct.irr * 100).toFixed(1)}%
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
