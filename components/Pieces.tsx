"use client";
import type { Exhibit } from "@/lib/types";

/** Renders any exhibit kind. Cases stored before non-table exhibits existed
 *  have no `kind`, so an absent kind falls through to the table branch. */
export function ExhibitTable({ ex }: { ex: Exhibit }) {
  const foot = ex.footnote ? <p className="ex-foot">{ex.footnote}</p> : null;

  if (ex.kind === "note") {
    return (
      <div className="exhibit-block note">
        <div className="ex-head">
          {ex.title}
          {ex.source && <span className="ex-src">{ex.source}</span>}
        </div>
        <p className="ex-body">{ex.body}</p>
        {foot}
      </div>
    );
  }

  if (ex.kind === "quote") {
    return (
      <div className="exhibit-block quote">
        <div className="ex-head">{ex.title}</div>
        <blockquote className="ex-quote">{ex.body}</blockquote>
        {ex.speaker && <div className="ex-src">— {ex.speaker}</div>}
        {foot}
      </div>
    );
  }

  if (ex.kind === "list") {
    return (
      <div className="exhibit-block">
        <div className="ex-head">{ex.title}</div>
        <ul className="ex-list">
          {ex.items.map((it, i) => (
            <li key={i}>
              <span className="k">{it.label}</span>
              {it.value != null && <span className="v fig">{String(it.value)}</span>}
              {it.note && <span className="n">{it.note}</span>}
            </li>
          ))}
        </ul>
        {foot}
      </div>
    );
  }

  if (ex.kind === "timeline") {
    return (
      <div className="exhibit-block">
        <div className="ex-head">{ex.title}</div>
        <ul className="ex-timeline">
          {ex.events.map((e, i) => (
            <li key={i}>
              <span className="when fig">{e.when}</span>
              <span className="what">{e.what}</span>
            </li>
          ))}
        </ul>
        {foot}
      </div>
    );
  }

  if (ex.kind === "chart") {
    const all = ex.series.flatMap((s) => s.points.map((p) => p.y));
    const max = Math.max(...all, 0);
    const min = Math.min(...all, 0);
    const span = max - min || 1;
    return (
      <div className="exhibit-block">
        <div className="ex-head">
          {ex.title}
          {ex.unit && <span className="ex-src">{ex.unit}</span>}
        </div>
        {ex.series.map((s, si) => (
          <div className="ex-series" key={si}>
            <div className="ex-series-label">{s.label}</div>
            <div className="ex-bars">
              {s.points.map((p, pi) => (
                <div className="ex-bar" key={pi} title={`${p.x}: ${p.y}`}>
                  <div className="ex-bar-fill" style={{ height: `${Math.max(2, ((p.y - min) / span) * 100)}%` }} />
                  <span className="ex-bar-x">{String(p.x)}</span>
                  <span className="ex-bar-y fig">{p.y}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {foot}
      </div>
    );
  }

  const t = ex as { title: string; columns?: string[]; rows?: (string | number)[][]; footnote?: string };
  const columns = t.columns ?? [];
  const rows = t.rows ?? [];
  return (
    <table className="exhibit">
      <caption>{t.title}</caption>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>
            {r.map((cell, ci) => (
              <td key={ci} className={ci === 0 ? "" : "fig"}>
                {String(cell)}
              </td>
            ))}
          </tr>
        ))}
        {t.footnote && (
          <tr className="footnote">
            <td colSpan={Math.max(1, columns.length)}>{t.footnote}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function scoreClass(s: number) {
  return s >= 80 ? "good" : s >= 65 ? "mid" : "bad";
}

export function ScoreReadout({
  total,
  dims,
}: {
  total: number;
  dims: { label: string; value: number }[];
}) {
  return (
    <div className="readout">
      <div className="big">
        {total}
        <span className="slash">/100</span>
      </div>
      <div className="dimbars">
        {dims.map((d) => (
          <div className="dimbar" key={d.label}>
            <span className="lbl">{d.label}</span>
            <span className="track">
              <span className="fill" style={{ width: `${d.value}%` }} />
            </span>
            <span className="val">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function fmtTime(sec: number) {
  const m = Math.floor(Math.abs(sec) / 60);
  const s = Math.abs(sec) % 60;
  return `${sec < 0 ? "-" : ""}${m}:${String(s).padStart(2, "0")}`;
}
