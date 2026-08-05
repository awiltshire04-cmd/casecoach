"use client";
import { useMemo, useState } from "react";
import { CATEGORY_META, dayKey, parseDayKey, type DayBucket } from "@/lib/activity";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;

function level(total: number): string {
  if (total <= 0) return "";
  if (total === 1) return "l1";
  if (total === 2) return "l2";
  if (total <= 4) return "l3";
  return "l4";
}

/** All-time contribution grid. Columns are weeks (Sunday-first), rows weekdays.
 *  Starts at the first recorded activity — or 26 weeks back when that's more
 *  recent — so a new account still gets a sensibly sized grid instead of a
 *  single lonely column. */
export function Heatmap({ days }: { days: Map<string, DayBucket> }) {
  const [tip, setTip] = useState<{ x: number; y: number; bucket: DayBucket | null; key: string } | null>(null);

  const { weeks, monthLabels } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const keys = [...days.keys()].sort();
    const earliest = keys.length ? parseDayKey(keys[0]) : today;
    const fallback = new Date(today);
    fallback.setDate(fallback.getDate() - 26 * 7);
    let start = earliest < fallback ? earliest : fallback;

    // Back up to the Sunday that starts that week.
    start = new Date(start);
    start.setDate(start.getDate() - start.getDay());

    const cols: { key: string; date: Date; future: boolean }[][] = [];
    const labels: { label: string; col: number }[] = [];
    const cursor = new Date(start);
    let lastMonth = -1;

    while (cursor <= today) {
      const col: { key: string; date: Date; future: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(cursor);
        col.push({ key: dayKey(date), date, future: date > today });
        cursor.setDate(cursor.getDate() + 1);
      }
      // Label a column when its first in-range day opens a new month.
      const marker = col.find((c) => !c.future) ?? col[0];
      if (marker.date.getMonth() !== lastMonth) {
        lastMonth = marker.date.getMonth();
        labels.push({ label: MONTHS[lastMonth], col: cols.length });
      }
      cols.push(col);
    }
    return { weeks: cols, monthLabels: labels };
  }, [days]);

  const total = useMemo(() => [...days.values()].reduce((a, b) => a + b.total, 0), [days]);

  if (total === 0) {
    return (
      <div className="empty">
        <strong>No practice logged yet</strong>
        Every case, model test, drill and interview you complete fills in a square here. Finish one session and
        your streak starts today.
      </div>
    );
  }

  return (
    <div className="heatwrap">
      <div className="heatscroll">
        <div className="heatinner">
          <div className="hm-days">
            <span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span />
          </div>
          <div className="hm-cols">
            <div className="hm-months" style={{ width: weeks.length * STEP }}>
              {monthLabels.map((m, i) => (
                <span key={`${m.label}-${i}`} className="m" style={{ left: m.col * STEP }}>
                  {m.label}
                </span>
              ))}
            </div>
            <div className="hm-grid">
              {weeks.map((col, ci) =>
                col.map((cell, ri) => {
                  const bucket = days.get(cell.key) ?? null;
                  const cls = cell.future ? "void" : level(bucket?.total ?? 0);
                  return (
                    <div
                      key={`${ci}-${ri}`}
                      className={`hm-cell ${cls}${cell.future ? "" : " on"}`}
                      onMouseEnter={(e) => {
                        if (cell.future) return;
                        const r = (e.target as HTMLElement).getBoundingClientRect();
                        const host = (e.currentTarget.closest(".heatwrap") as HTMLElement).getBoundingClientRect();
                        setTip({ x: r.left - host.left + r.width / 2, y: r.top - host.top, bucket, key: cell.key });
                      }}
                      onMouseLeave={() => setTip(null)}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: "0.7rem" }}>
        <span className="sub">
          {total} session{total === 1 ? "" : "s"} · {days.size} active day{days.size === 1 ? "" : "s"}
        </span>
        <div className="spacer" />
        <div className="hm-legend">
          Less
          <span className="hm-cell" />
          <span className="hm-cell l1" />
          <span className="hm-cell l2" />
          <span className="hm-cell l3" />
          <span className="hm-cell l4" />
          More
        </div>
      </div>

      {tip && (
        <div className="hm-tip" style={{ left: tip.x, top: tip.y }}>
          <div className="d">
            {parseDayKey(tip.key).toLocaleDateString(undefined, {
              weekday: "short", month: "short", day: "numeric", year: "numeric",
            })}
          </div>
          {tip.bucket ? (
            Object.entries(tip.bucket.byCategory).map(([k, n]) => (
              <div className="r" key={k}>
                <span>{CATEGORY_META.find((c) => c.key === k)?.label ?? k}</span>
                <span>{n}</span>
              </div>
            ))
          ) : (
            <div>No practice</div>
          )}
        </div>
      )}
    </div>
  );
}
