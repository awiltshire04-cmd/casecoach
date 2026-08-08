"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/http";
import { ModelAudit } from "@/components/ModelAudit";
import { TOGGLES, type GradeBreakdown } from "@/lib/modeltest/types";

interface Loaded {
  attempt: {
    id: string; opened_at: string; submitted_at: string | null; time_taken_sec: number | null;
    file_path: string | null; writeup: string | null; grade: GradeBreakdown | null; status: string;
  };
  test: {
    params: { concepts: string[]; difficulty: string; presentation: string; industry: string };
    case_structured: { company: string; hold_years: number };
    case_rendered: { pages: { title: string; body: string }[] };
  };
}

function fmtClock(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h > 0 ? `${h}:` : "") + `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function ModelTestDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pageIdx, setPageIdx] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        // Read through the service role — see app/api/modeltest-archive/route.ts.
        const loaded = await apiFetch<Loaded>(`/api/modeltest-archive?attemptId=${encodeURIComponent(id)}`);
        if (!loaded.attempt || !loaded.test) throw new Error("Attempt not found");
        setData(loaded);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load attempt");
      }
    })();
  }, [id]);

  if (err) return <div className="callout error">{err}</div>;
  if (!data) return <div className="row"><span className="spin" /> Loading…</div>;

  const { attempt, test } = data;
  const g = attempt.grade;
  const pages = test.case_rendered?.pages ?? [];
  const page = pages[pageIdx];
  const concepts = test.params?.concepts ?? [];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="eyebrow">Archive · Model Test</div>
          <h1>{test.case_structured?.company}</h1>
          <p className="sub">
            {new Date(attempt.opened_at).toLocaleString()} · {test.params?.industry} · {test.params?.difficulty} ·{" "}
            {test.params?.presentation === "cim" ? "CIM" : "Direct Assumptions"}
            {attempt.time_taken_sec != null && <> · {fmtClock(attempt.time_taken_sec)}</>}
          </p>
        </div>
        <div className="row no-print">
          <button onClick={() => window.print()}>Download Case PDF</button>
          {attempt.file_path && (
            <a href={`/api/modeltest-file?attemptId=${attempt.id}`}>
              <button>Download My Excel</button>
            </a>
          )}
          <button className="ghost" onClick={() => router.push("/archive")}>Back to Archive</button>
        </div>
      </div>

      <div className="row wrap no-print">
        {concepts.map((k) => (
          <span key={k} className="chip">{TOGGLES.find((t) => t.key === k)?.label ?? k}</span>
        ))}
      </div>

      {g && (
        <div className="card row wrap" style={{ alignItems: "baseline", gap: "2rem" }}>
          <div>
            <div className="eyebrow">Total</div>
            <div className="mono" style={{ fontSize: "2.2rem" }}>{g.total}</div>
          </div>
          {([
            ["Outputs", g.outputs.score],
            ...(g.mechanics ? [["Mechanics", g.mechanics.score] as [string, number]] : []),
            ...(g.integrity ? [["Integrity", g.integrity.score] as [string, number]] : []),
            // Pre-audit attempts scored structure directly; newer ones fold it into integrity.
            ...(g.mechanics ? [] : [["Structure", g.structure.score] as [string, number]]),
            ["Write-Up", g.writeup.score],
          ] as [string, number][]).map(([k, v]) => (
            <div key={String(k)}>
              <div className="eyebrow">{k}</div>
              <div className="mono" style={{ fontSize: "1.4rem" }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {g && <ModelAudit g={g} />}

      {g && (
        <div className="card no-print">
          <h3>Outputs vs. Reference</h3>
          <table className="check-table">
            <thead><tr><th>Output</th><th>Reference</th><th>Your Model</th><th>Found at</th><th></th></tr></thead>
            <tbody>
              {g.outputs.checks.map((c) => (
                <tr key={c.label} className={c.pass ? "pass" : "fail"}>
                  <td>{c.label}</td>
                  <td className="mono">{c.expected}{c.kind === "pct" ? "%" : c.kind === "mult" ? "x" : ""}</td>
                  <td className="mono">{c.found == null ? "not found" : `${c.found}${c.kind === "pct" ? "%" : c.kind === "mult" ? "x" : ""}`}</td>
                  <td className="mono sub">{c.ref ?? "—"}</td>
                  <td className="mono">{c.pass ? "✓" : "✗"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <div className="pagenav no-print">
          <button onClick={() => setPageIdx((i) => Math.max(0, i - 1))} disabled={pageIdx === 0}>‹ Prev</button>
          <div className="pagenav-pages">
            {pages.map((p, i) => (
              <button key={i} className={`pagechip${i === pageIdx ? " on" : ""}`} onClick={() => setPageIdx(i)} title={p.title}>{i + 1}</button>
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

      {attempt.writeup && (
        <div className="card no-print">
          <h3>My Write-Up</h3>
          <div className="body" style={{ whiteSpace: "pre-wrap" }}>{attempt.writeup}</div>
          {g && (["numerical", "judgment", "comms"] as const).map((k) => (
            <p key={k} className="sub" style={{ marginTop: "0.6rem" }}>
              <strong style={{ textTransform: "capitalize" }}>{k}</strong> ({g.writeup.dimension_scores[k] ?? "—"}): {g.writeup.feedback[k]}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
