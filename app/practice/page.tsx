"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getActiveCase } from "@/lib/session";
import { postJson } from "@/lib/http";
import { ExhibitTable, ScoreReadout, fmtTime } from "@/components/Pieces";
import { DEFAULT_DIMENSIONS, type CaseRow, type GradeResult } from "@/lib/types";

type Phase = "brief" | "writing" | "selfscore" | "grading" | "feedback";

export default function PracticePage() {
  const router = useRouter();
  const [c, setC] = useState<CaseRow | null>(null);
  const [phase, setPhase] = useState<Phase>("brief");
  const [remaining, setRemaining] = useState(0);
  const [response, setResponse] = useState("");
  const [selfScore, setSelfScore] = useState(70);
  const [result, setResult] = useState<(GradeResult & { attemptId: string }) | null>(null);
  const [exemplar, setExemplar] = useState<string | null>(null);
  const [gaps, setGaps] = useState<string[] | null>(null);
  const [loadingExemplar, setLoadingExemplar] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const startedAt = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const active = getActiveCase();
    if (!active) {
      router.replace("/");
      return;
    }
    setC(active);
    setRemaining(active.suggested_time_sec);
  }, [router]);

  function beginWriting() {
    setPhase("writing");
    startedAt.current = Date.now();
    timerRef.current = setInterval(() => {
      setRemaining((r) => r - 1);
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }
  useEffect(() => () => stopTimer(), []);

  function toSelfScore() {
    stopTimer();
    setPhase("selfscore");
  }

  async function submit() {
    if (!c) return;
    setPhase("grading");
    setErr(null);
    const timeTaken = Math.round((Date.now() - startedAt.current) / 1000);
    try {
      const json = await postJson<{
        attempt: {
          id: string;
          dimension_scores: Record<string, number>;
          feedback: { dimensions: Record<string, string>; tests_callouts: { title: string; body: string }[] };
        };
        total: number;
      }>("/api/grade-attempt", {
        caseId: c.id,
        response,
        selfScore,
        timeAllottedSec: c.suggested_time_sec,
        timeTakenSec: Math.max(1, timeTaken),
      });
      setResult({
        attemptId: json.attempt.id,
        total: json.total,
        dimension_scores: json.attempt.dimension_scores,
        dimension_feedback: json.attempt.feedback.dimensions,
        tests_callouts: json.attempt.feedback.tests_callouts,
      });
      setPhase("feedback");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Grading failed");
      setPhase("selfscore");
    }
  }

  async function loadExemplar() {
    if (!c) return;
    setLoadingExemplar(true);
    try {
      const json = await postJson<{ exemplar: string; gaps?: string[] }>("/api/generate-exemplar", {
        caseId: c.id,
        candidateResponse: response,
      });
      setExemplar(json.exemplar);
      setGaps(json.gaps ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Exemplar failed");
    } finally {
      setLoadingExemplar(false);
    }
  }

  if (!c) return <div className="empty">Loading case…</div>;

  const timerClass = remaining <= 30 ? "low" : remaining <= 90 ? "mid" : "";
  const dimLabel = (k: string) => DEFAULT_DIMENSIONS.find((d) => d.key === k)?.label ?? k;

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">02 · Practice</div>
        <h1>{c.title}</h1>
        <div className="row wrap" style={{ marginTop: "0.5rem", gap: "0.35rem" }}>
          <span className="chip blue">{c.type}</span>
          <span className="chip">{c.industry}</span>
          <span className="chip">{c.difficulty}</span>
          <span className="chip">{c.length}</span>
        </div>
      </div>

      {/* PROMPT + EXHIBITS always visible */}
      <div className="card stack" style={{ marginBottom: "1.2rem" }}>
        <div style={{ whiteSpace: "pre-wrap" }}>{c.prompt}</div>
        {c.exhibits?.length > 0 && (
          <div className="stack">
            {c.exhibits.map((ex, i) => (
              <ExhibitTable key={i} ex={ex} />
            ))}
          </div>
        )}
      </div>

      {/* PHASE: brief -> start */}
      {phase === "brief" && (
        <div className="card row">
          <div>
            <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Suggested time</div>
            <div className="timer">{fmtTime(c.suggested_time_sec)}</div>
          </div>
          <div className="spacer" />
          <button className="primary" onClick={beginWriting}>
            Start timer & respond
          </button>
        </div>
      )}

      {/* PHASE: writing */}
      {phase === "writing" && (
        <div className="card stack">
          <div className="row">
            <span className="chip">Time remaining</span>
            <div className={`timer ${timerClass}`}>{fmtTime(remaining)}</div>
            <div className="spacer" />
            <span style={{ fontSize: "0.78rem", color: "var(--faint)" }} className="mono">
              {response.trim() ? response.trim().split(/\s+/).length : 0} words
            </span>
          </div>
          <textarea
            rows={14}
            placeholder="Lead with your verdict. Name the central question. Structure, quantify, close with what would change your mind."
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            autoFocus
          />
          <div className="row">
            <button className="primary" onClick={toSelfScore} disabled={!response.trim()}>
              Done — submit
            </button>
            <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
              Timer keeps running; submit when you&apos;re ready.
            </span>
          </div>
        </div>
      )}

      {/* PHASE: self-score (captured before AI reveal) */}
      {phase === "selfscore" && (
        <div className="card stack">
          <div>
            <h3>Rate your own answer first</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0.3rem 0 0" }}>
              Before you see the AI score. Tracking the gap trains your calibration — knowing when you did well matters.
            </p>
          </div>
          <div className="row">
            <input
              type="range"
              min={0}
              max={100}
              value={selfScore}
              onChange={(e) => setSelfScore(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span className="mono" style={{ fontSize: "1.4rem", width: 48, textAlign: "right" }}>
              {selfScore}
            </span>
          </div>
          {err && <p style={{ color: "var(--bad)", fontSize: "0.85rem", margin: 0 }}>{err}</p>}
          <div className="row">
            <button className="primary" onClick={submit}>
              Reveal AI score
            </button>
          </div>
        </div>
      )}

      {/* PHASE: grading */}
      {phase === "grading" && (
        <div className="empty">
          <span className="spin" /> &nbsp;Grading your response against the rubric…
        </div>
      )}

      {/* PHASE: feedback */}
      {phase === "feedback" && result && (
        <div className="stack">
          <div className="card stack">
            <ScoreReadout
              total={result.total}
              dims={Object.entries(result.dimension_scores).map(([k, v]) => ({ label: dimLabel(k), value: v }))}
            />
            <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: "0.8rem" }}>
              <span className="chip">Your self-score {selfScore}</span>
              <span className="chip blue">
                Calibration gap {selfScore - result.total > 0 ? "+" : ""}
                {selfScore - result.total}
              </span>
              <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                {Math.abs(selfScore - result.total) <= 5
                  ? "Well calibrated."
                  : selfScore > result.total
                  ? "You rated yourself higher than the grader."
                  : "You underrated yourself."}
              </span>
            </div>
          </div>

          <div className="split">
            <div className="card stack">
              <h3>Dimension feedback</h3>
              {Object.entries(result.dimension_feedback).map(([k, txt]) => (
                <div key={k}>
                  <div className="row">
                    <strong style={{ fontSize: "0.9rem" }}>{dimLabel(k)}</strong>
                    <span className="mono chip">{result.dimension_scores[k]}</span>
                  </div>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.88rem", color: "var(--ink-2)" }}>{txt}</p>
                </div>
              ))}
            </div>

            <div className="stack">
              <h3 style={{ marginLeft: "0.1rem" }}>What this case was really testing</h3>
              {result.tests_callouts.map((co, i) => (
                <div className="callout" key={i}>
                  <h4>{co.title}</h4>
                  <p>{co.body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Side-by-side answer diff */}
          <div className="card stack">
            <div className="row">
              <h3>Your answer vs. the exemplar</h3>
              <div className="spacer" />
              {!exemplar && (
                <button onClick={loadExemplar} disabled={loadingExemplar} className="no-print">
                  {loadingExemplar ? (
                    <>
                      <span className="spin" /> &nbsp;Generating…
                    </>
                  ) : (
                    "Generate Comparison"
                  )}
                </button>
              )}
            </div>
            {exemplar ? (
              <>
                <div className="diff">
                  <div>
                    <div className="diff-head">Your answer</div>
                    <div className="body">{response}</div>
                  </div>
                  <div>
                    <div className="diff-head">A+ exemplar</div>
                    <div className="body">{exemplar}</div>
                  </div>
                </div>
                {gaps && gaps.length > 0 && (
                  <div>
                    <div className="diff-head" style={{ marginBottom: "0.3rem" }}>What the exemplar did that yours didn&apos;t</div>
                    <ul className="gap-list">
                      {gaps.map((g, i) => (
                        <li key={i}>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>
                Generate the comparison to see your answer beside an ideal one, with the specific gaps called out.
              </p>
            )}
          </div>

          <div className="row no-print">
            <button className="primary" onClick={() => router.push("/archive")}>
              View archive
            </button>
            <button onClick={() => router.push("/")}>New Case</button>
            <div className="spacer" />
            <button onClick={() => window.print()}>Export to PDF</button>
          </div>
        </div>
      )}
    </>
  );
}
