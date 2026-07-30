"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { ExhibitTable, scoreClass } from "@/components/Pieces";
import type { Exhibit } from "@/lib/types";

interface Loaded {
  attempt: {
    id: string; created_at: string; response: string;
    ai_score: number | null; self_score: number | null;
    dimension_scores: Record<string, number> | null;
    feedback: { dimensions?: Record<string, string>; tests_callouts?: { title: string; body: string }[] } | null;
    time_allotted_sec: number; time_taken_sec: number;
  };
  case: {
    title: string; prompt: string; exhibits: Exhibit[];
    type: string; industry: string; difficulty: string;
    exemplar: string | null; exemplar_gaps: string[] | null;
  };
}

function fmtClock(s: number) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function CaseAttemptDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const supa = browserClient();
        const { data: att, error } = await supa
          .from("attempts")
          .select("*, cases(title, prompt, exhibits, type, industry, difficulty, exemplar, exemplar_gaps)")
          .eq("id", id)
          .single();
        if (error || !att) throw error ?? new Error("Attempt not found");
        const { cases, ...attempt } = att as unknown as Loaded["attempt"] & { cases: Loaded["case"] };
        setData({ attempt, case: cases });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load attempt");
      }
    })();
  }, [id]);

  if (err) return <div className="callout error">{err}</div>;
  if (!data) return <div className="row"><span className="spin" /> Loading…</div>;

  const { attempt, case: c } = data;
  const dims = attempt.dimension_scores ?? {};
  const fb = attempt.feedback ?? {};

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="eyebrow">Archive · Case Study</div>
          <h1>{c.title}</h1>
          <p className="sub">
            {new Date(attempt.created_at).toLocaleString()} · {c.industry} · {c.type} · {c.difficulty} ·{" "}
            {fmtClock(attempt.time_taken_sec)} of {fmtClock(attempt.time_allotted_sec)}
          </p>
        </div>
        <div className="row no-print">
          <button onClick={() => window.print()}>Export PDF</button>
          <button className="ghost" onClick={() => router.push("/archive")}>Back to Archive</button>
        </div>
      </div>

      {attempt.ai_score != null && (
        <div className="card readout">
          <div className="big">
            <span className={scoreClass(attempt.ai_score)}>{attempt.ai_score}</span>
            <span className="slash">/100</span>
          </div>
          <div className="dimbars">
            {Object.entries(dims).map(([k, v]) => (
              <div key={k} className="dimbar">
                <span className="lbl" style={{ textTransform: "capitalize" }}>{k}</span>
                <div className="track"><div className="fill" style={{ width: `${v}%` }} /></div>
                <span className="val">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card stack">
        <h3>Case Prompt</h3>
        <div style={{ whiteSpace: "pre-wrap" }}>{c.prompt}</div>
        {c.exhibits?.length > 0 && c.exhibits.map((ex, i) => <ExhibitTable key={i} ex={ex} />)}
      </div>

      <div className="card stack">
        <h3>My Response</h3>
        <div className="body" style={{ whiteSpace: "pre-wrap" }}>{attempt.response}</div>
      </div>

      {fb.dimensions && (
        <div className="card stack">
          <h3>Feedback</h3>
          {Object.entries(fb.dimensions).map(([k, v]) => (
            <p key={k} className="sub"><strong style={{ textTransform: "capitalize" }}>{k}:</strong> {v}</p>
          ))}
          {fb.tests_callouts?.map((t, i) => (
            <div key={i} className="callout"><h4>{t.title}</h4><p>{t.body}</p></div>
          ))}
        </div>
      )}

      {c.exemplar && (
        <div className="diff">
          <div>
            <div className="diff-head">My Response</div>
            <div className="body">{attempt.response}</div>
          </div>
          <div>
            <div className="diff-head">Exemplar</div>
            <div className="body">{c.exemplar}</div>
          </div>
        </div>
      )}
    </div>
  );
}
