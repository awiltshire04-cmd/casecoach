"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/http";
import { CASE_TYPES, type Takeaway } from "@/lib/types";

// Theme order is deliberate: the things that decide a deal first, presentation
// last — so a pre-interview skim reads top-down.
const THEME_ORDER = [
  "Unit economics",
  "Revenue quality",
  "Cash conversion",
  "Earnings quality",
  "Market and competition",
  "Value creation",
  "Valuation",
  "People and governance",
  "External risk",
  "Diligence judgment",
  "Structuring",
  "Communication",
];

export default function ReviewSheetPage() {
  const [items, setItems] = useState<Takeaway[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [setupMsg, setSetupMsg] = useState<string | null>(null);
  const [activeTheme, setActiveTheme] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ takeaways: Takeaway[] }>("/api/case-takeaways");
        setItems(res.takeaways ?? []);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not load your review sheet";
        if (/migration_006|doesn't exist/i.test(msg)) setSetupMsg(msg);
        else setErr(msg);
        setItems([]);
      }
    })();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Takeaway[]>();
    for (const t of items ?? []) {
      const theme = t.theme?.trim() || "General";
      if (!map.has(theme)) map.set(theme, []);
      map.get(theme)!.push(t);
    }
    return [...map.entries()].sort((a, b) => {
      const ia = THEME_ORDER.indexOf(a[0]);
      const ib = THEME_ORDER.indexOf(b[0]);
      if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [items]);

  const shown = activeTheme ? grouped.filter(([t]) => t === activeTheme) : grouped;
  const loading = items === null;
  const typeLabel = (t?: string) => CASE_TYPES.find((x) => x.value === t)?.label ?? t ?? "";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Case Prep · Review sheet</div>
          <h1>What you&apos;ve learned</h1>
          <p className="sub">
            Every durable takeaway from every case you&apos;ve completed, grouped by theme. Built for the skim the
            night before, not for reliving individual cases.
          </p>
        </div>
        <div className="row no-print">
          <button onClick={() => window.print()}>Print</button>
          <Link href="/archive">
            <button className="ghost">Archive →</button>
          </Link>
        </div>
      </div>

      {setupMsg && (
        <div className="callout" style={{ marginBottom: "var(--s5)" }}>
          <h4>One setup step left</h4>
          <p>{setupMsg}</p>
        </div>
      )}
      {err && (
        <div className="callout error" style={{ marginBottom: "var(--s5)" }}>
          <p>{err}</p>
        </div>
      )}

      {loading ? (
        <div className="stack">
          {Array.from({ length: 3 }).map((_, i) => (
            <div className="card" key={i}>
              <div className="skel skel-line w-40" />
              <div className="skel skel-line w-80" />
              <div className="skel skel-line w-60" />
            </div>
          ))}
        </div>
      ) : (items?.length ?? 0) === 0 ? (
        <div className="empty">
          <strong>Nothing here yet</strong>
          Finish a case and its takeaways collect here automatically — the transferable lessons, not the numbers.
        </div>
      ) : (
        <>
          <div className="row wrap no-print" style={{ marginBottom: "var(--s4)" }}>
            <button
              className={`chip${activeTheme === null ? " blue" : ""}`}
              style={{ cursor: "pointer" }}
              onClick={() => setActiveTheme(null)}
            >
              All themes <span className="mono" style={{ opacity: 0.6 }}>{items?.length ?? 0}</span>
            </button>
            {grouped.map(([theme, list]) => (
              <button
                key={theme}
                className={`chip${activeTheme === theme ? " blue" : ""}`}
                style={{ cursor: "pointer" }}
                onClick={() => setActiveTheme(activeTheme === theme ? null : theme)}
              >
                {theme} <span className="mono" style={{ opacity: 0.6 }}>{list.length}</span>
              </button>
            ))}
          </div>

          <div className="stack loose">
            {shown.map(([theme, list]) => (
              <div className="card stack" key={theme}>
                <div className="section-head" style={{ marginBottom: 0 }}>
                  <h2>{theme}</h2>
                  <span className="sub">
                    {list.length} takeaway{list.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="takeaway-list">
                  {list.map((t) => (
                    <li key={t.id}>
                      <span className="tk-text">{t.text}</span>
                      <span className="tk-meta">
                        <Link href={`/archive/case/${t.attempt_id ?? ""}`} className="tk-case">
                          {t.case_title}
                        </Link>
                        {t.case_type && <span className="chip">{typeLabel(t.case_type)}</span>}
                        <span className="mono">
                          {new Date(t.created_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
