"use client";
import { scoreClass } from "@/components/Pieces";
import { paceLabel, fillerLabel } from "@/lib/interview/metrics";
import type { AnswerFeedback, RubricDimension, SpeechMetrics } from "@/lib/interview/types";

export function AnswerGrade({
  score,
  breakdown,
  dimensionNotes,
  feedback,
  metrics,
  rubric,
}: {
  score: number;
  breakdown: Record<string, number>;
  dimensionNotes: Record<string, string>;
  feedback: AnswerFeedback | null;
  metrics: SpeechMetrics | null;
  rubric: RubricDimension[];
}) {
  const pace = metrics ? paceLabel(metrics.wpm) : null;
  const fill = metrics ? fillerLabel(metrics.fillerRate) : null;

  return (
    <div className="stack">
      <div className="card stack">
        <div className="readout">
          <div className="big">
            <span className={scoreClass(score)}>{score}</span>
            <span className="slash">/100</span>
          </div>
          <div className="dimbars">
            {rubric.map((d) => (
              <div className="dimbar" key={d.key}>
                <span className="lbl">{d.label}</span>
                <span className="track">
                  <span className="fill" style={{ width: `${breakdown[d.key] ?? 0}%` }} />
                </span>
                <span className="val">{breakdown[d.key] ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>

        {metrics && metrics.durationSec > 0 && (
          <div className="row wrap" style={{ borderTop: "1px solid var(--line)", paddingTop: "0.9rem" }}>
            <span className="chip">{metrics.durationSec}s spoken</span>
            <span className="chip">{metrics.wordCount} words</span>
            {pace && <span className={`chip ${pace.tone}`}>{metrics.wpm} wpm · {pace.label}</span>}
            {fill && (
              <span className={`chip ${fill.tone}`}>
                {metrics.fillerCount} filler{metrics.fillerCount === 1 ? "" : "s"} · {fill.label}
              </span>
            )}
            {metrics.topFillers.length > 0 && (
              <span className="sub">
                most used: {metrics.topFillers.map((f) => `"${f.word}" ×${f.count}`).join(", ")}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="split">
        <div className="card stack">
          <h3>Dimension notes</h3>
          {rubric.map((d) => (
            <div key={d.key}>
              <div className="row">
                <strong style={{ fontSize: "var(--t-base)" }}>{d.label}</strong>
                <span className="mono chip">{breakdown[d.key] ?? "—"}</span>
              </div>
              <p style={{ margin: "0.25rem 0 0", fontSize: "var(--t-base)", color: "var(--ink-2)" }}>
                {dimensionNotes[d.key] ?? "—"}
              </p>
            </div>
          ))}
        </div>

        <div className="stack">
          {feedback?.worked?.length ? (
            <div className="callout" style={{ borderLeft: "3px solid var(--good)" }}>
              <h4>What worked</h4>
              <ul className="fb-list">
                {feedback.worked.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {feedback?.cut?.length ? (
            <div className="callout" style={{ borderLeft: "3px solid var(--bad)" }}>
              <h4>Cut this</h4>
              <ul className="fb-list">
                {feedback.cut.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {feedback?.add?.length ? (
            <div className="callout" style={{ borderLeft: "3px solid var(--accent)" }}>
              <h4>Add this</h4>
              <ul className="fb-list">
                {feedback.add.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {feedback?.rewrites?.length ? (
        <div className="card stack">
          <h3>Say it like this instead</h3>
          {feedback.rewrites.map((r, i) => (
            <div className="rewrite" key={i}>
              <div className="before">
                <span className="tag">You said</span>
                {r.before}
              </div>
              <div className="after">
                <span className="tag">Sharper</span>
                {r.after}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
