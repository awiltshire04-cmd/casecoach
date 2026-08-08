"use client";
import type { GradeBreakdown, ModelFinding } from "@/lib/modeltest/types";

// Shared between the live results screen and the archive detail view, so a
// re-opened attempt shows exactly what was shown at grading time.

function FindingList({ findings }: { findings: ModelFinding[] }) {
  return (
    <>
      {findings.map((f, i) => (
        <div className="concept-row" key={`${f.area}-${i}`}>
          <span className={`verdict ${f.verdict === "missing" ? "not_found" : f.verdict}`}>{f.verdict}</span>
          <div style={{ minWidth: 0 }}>
            <div className="t-label">{f.area}</div>
            <div className="t-desc">{f.note}</div>
            {f.cells.length > 0 && (
              <div className="cellrefs">
                {f.cells.slice(0, 8).map((c) => (
                  <span className="cellref" key={c}>{c}</span>
                ))}
                {f.cells_valid === false && (
                  <span className="cellref bad" title="At least one cited cell isn't in the workbook">
                    unverified
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

export function ModelAudit({ g }: { g: GradeBreakdown }) {
  const hasAudit = Boolean(g.mechanics || g.integrity || g.narrative);
  if (!hasAudit) return null;

  return (
    <>
      {g.narrative && (g.narrative.summary || g.narrative.fixes?.length) && (
        <div className="card stack">
          <h3>Reviewer&apos;s read</h3>
          {g.narrative.summary && <p style={{ margin: 0, fontSize: "var(--t-md)" }}>{g.narrative.summary}</p>}
          <div className="split">
            {g.narrative.strengths?.length > 0 && (
              <div className="callout" style={{ borderLeft: "3px solid var(--good)" }}>
                <h4>Built well</h4>
                <ul className="fb-list">
                  {g.narrative.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {g.narrative.fixes?.length > 0 && (
              <div className="callout" style={{ borderLeft: "3px solid var(--accent)" }}>
                <h4>Fix in this order</h4>
                <ol className="fb-list ordered">
                  {g.narrative.fixes.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      {g.mechanics && g.mechanics.findings.length > 0 && (
        <div className="card stack">
          <div className="section-head" style={{ marginBottom: 0 }}>
            <h3>Model mechanics</h3>
            <span className="sub">How it&apos;s built — traced through your own formulas</span>
            <div className="spacer" />
            <span className="mono chip">{g.mechanics.score}</span>
          </div>
          <FindingList findings={g.mechanics.findings} />
        </div>
      )}

      {g.integrity && g.integrity.findings.length > 0 && (
        <div className="card stack">
          <div className="section-head" style={{ marginBottom: 0 }}>
            <h3>Model integrity</h3>
            <span className="sub">Hardcodes, broken links, sign conventions</span>
            <div className="spacer" />
            <span className="mono chip">{g.integrity.score}</span>
          </div>
          <FindingList findings={g.integrity.findings} />
        </div>
      )}

      {g.audit_meta && (
        <p className="sub">
          {g.audit_meta.fell_back
            ? "Graded by label matching — the holistic audit was unavailable for this attempt."
            : `Audited ${g.audit_meta.formulas} formulas across ${g.audit_meta.cells} cells${
                g.audit_meta.mode === "digest" ? " (large workbook — reviewed as a formula digest)" : ""
              }.`}
          {g.audit_meta.invalid_citations > 0 &&
            ` ${g.audit_meta.invalid_citations} citation(s) couldn't be matched to a cell and are marked unverified.`}
        </p>
      )}
    </>
  );
}
