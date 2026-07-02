"use client";
import type { Exhibit } from "@/lib/types";

export function ExhibitTable({ ex }: { ex: Exhibit }) {
  return (
    <table className="exhibit">
      <caption>{ex.title}</caption>
      <thead>
        <tr>
          {ex.columns.map((c, i) => (
            <th key={i}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ex.rows.map((r, ri) => (
          <tr key={ri}>
            {r.map((cell, ci) => (
              <td key={ci} className={ci === 0 ? "" : "fig"}>
                {String(cell)}
              </td>
            ))}
          </tr>
        ))}
        {ex.footnote && (
          <tr className="footnote">
            <td colSpan={ex.columns.length}>{ex.footnote}</td>
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
