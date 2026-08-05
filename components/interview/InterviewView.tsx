"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/http";
import { scoreClass } from "@/components/Pieces";
import { VoiceAnswer, type VoiceAnswerHandle } from "@/components/VoiceAnswer";
import { AnswerGrade } from "@/components/AnswerGrade";
import { FlagControl } from "@/components/interview/FlagControl";
import {
  rubricFor,
  type AnswerFeedback,
  type Question,
  type Section,
  type SessionOverall,
  type SpeechMetrics,
} from "@/lib/interview/types";

interface Graded {
  attemptId: string;
  score: number;
  breakdown: Record<string, number>;
  dimensionNotes: Record<string, string>;
  feedback: AnswerFeedback | null;
  metrics: SpeechMetrics | null;
  followup: { asked: boolean; reason: string; question: string | null };
}

type Phase = "answering" | "followup" | "reviewing" | "finishing" | "done";

const KEY = (id: string) => `casecoach:interview:${id}`;

export function InterviewView({
  section,
  sessionId: id,
  categories,
  flaggable = false,
}: {
  section: Section;
  sessionId: string;
  categories: { key: string; label: string }[];
  flaggable?: boolean;
}) {
  const router = useRouter();
  const rubric = rubricFor(section);
  const sectionLabel = section === "technical" ? "Technical" : "Behavioral";

  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("answering");
  const [graded, setGraded] = useState<Graded | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [overall, setOverall] = useState<SessionOverall | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The question list comes back once, at session start. Keep it locally so a
  // refresh mid-interview doesn't lose the run.
  useEffect(() => {
    const cached = typeof window !== "undefined" ? sessionStorage.getItem(KEY(id)) : null;
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { questions: Question[]; idx: number; scores: number[] };
        setQuestions(parsed.questions);
        setIdx(parsed.idx ?? 0);
        setScores(parsed.scores ?? []);
        return;
      } catch {
        /* fall through to a fresh load */
      }
    }
    (async () => {
      try {
        const res = await apiFetch<{ questions: Question[] }>(
          `/api/interview/questions?section=${section}&random=1&count=5`
        );
        setQuestions(res.questions ?? []);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load the interview");
        setQuestions([]);
      }
    })();
  }, [id]);

  const persist = useCallback(
    (qs: Question[], i: number, sc: number[]) => {
      try {
        sessionStorage.setItem(KEY(id), JSON.stringify({ questions: qs, idx: i, scores: sc }));
      } catch {
        /* storage is a nicety, not a requirement */
      }
    },
    [id]
  );

  const current = questions?.[idx] ?? null;
  const total = questions?.length ?? 0;

  async function submitAnswer(answer: VoiceAnswerHandle) {
    if (!current) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await apiFetch<Graded>("/api/interview/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: current.id,
          transcript: answer.transcript,
          durationSec: answer.durationSec,
          inputMode: answer.mode,
          sessionId: id,
          ordinal: idx + 1,
          allowFollowUp: true,
        }),
      });
      setGraded(res);
      const next = [...scores, res.score];
      setScores(next);
      if (questions) persist(questions, idx, next);
      setPhase(res.followup?.asked && res.followup.question ? "followup" : "reviewing");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Grading failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitFollowUp(answer: VoiceAnswerHandle) {
    if (!graded) return;
    setSubmitting(true);
    try {
      await apiFetch("/api/interview/attempt", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: graded.attemptId, transcript: answer.transcript }),
      });
    } catch {
      /* the follow-up is colour on the attempt, not the grade — don't block */
    } finally {
      setSubmitting(false);
      setPhase("reviewing");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function next() {
    if (!questions) return;
    if (idx + 1 < questions.length) {
      const ni = idx + 1;
      setIdx(ni);
      setGraded(null);
      setPhase("answering");
      persist(questions, ni, scores);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setPhase("finishing");
    try {
      const res = await apiFetch<{ overall: SessionOverall | null }>("/api/interview/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finish", sessionId: id }),
      });
      setOverall(res.overall);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not build the debrief");
    } finally {
      try {
        sessionStorage.removeItem(KEY(id));
      } catch {
        /* ignore */
      }
      setPhase("done");
    }
  }

  if (err && !questions?.length) return <div className="callout error">{err}</div>;
  if (!questions) {
    return (
      <div className="stack">
        <div className="skel skel-line w-40" />
        <div className="skel skel-block" />
      </div>
    );
  }

  // ---------------------------------------------------------------- debrief
  if (phase === "done" || phase === "finishing") {
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return (
      <div className="stack loose">
        <div className="page-head">
          <div>
            <div className="eyebrow">{sectionLabel} · Debrief</div>
            <h1>Interview complete</h1>
            <p className="sub">
              {scores.length} question{scores.length === 1 ? "" : "s"} answered.
            </p>
          </div>
        </div>

        {phase === "finishing" ? (
          <div className="empty">
            <span className="spin" /> &nbsp;Reading back through the whole session…
          </div>
        ) : (
          <>
            <div className="card">
              <div className="readout">
                <div className="big">
                  <span className={scoreClass(overall?.score ?? avg)}>{overall?.score ?? avg}</span>
                  <span className="slash">/100</span>
                </div>
                <div className="stack tight" style={{ flex: 1 }}>
                  <div className="row wrap">
                    {scores.map((s, i) => (
                      <span key={i} className="chip">
                        Q{i + 1} <span className={`mono ${scoreClass(s)}`}>{s}</span>
                      </span>
                    ))}
                  </div>
                  {overall?.summary && <p style={{ margin: 0, fontSize: "var(--t-md)" }}>{overall.summary}</p>}
                </div>
              </div>
            </div>

            <div className="split">
              <div className="callout" style={{ borderLeft: "3px solid var(--good)" }}>
                <h4>Recurring strengths</h4>
                <ul className="fb-list">
                  {(overall?.strengths ?? []).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                  {!overall?.strengths?.length && <li className="sub">—</li>}
                </ul>
              </div>
              <div className="callout" style={{ borderLeft: "3px solid var(--accent)" }}>
                <h4>Fix these first</h4>
                <ul className="fb-list">
                  {(overall?.priorities ?? []).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                  {!overall?.priorities?.length && <li className="sub">—</li>}
                </ul>
              </div>
            </div>

            <div className="row no-print">
              <button className="primary" onClick={() => router.push(`/${section}`)}>
                Run another
              </button>
              <button onClick={() => router.push("/")}>See progress</button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- in progress
  const categoryLabel = current
    ? categories.find((c) => c.key === current.category)?.label ?? current.category
    : "";

  return (
    <div className="stack loose">
      <div className="page-head">
        <div style={{ width: "100%" }}>
          <div className="eyebrow">{sectionLabel} · Interview mode</div>
          <div className="progressbar" aria-label={`Question ${idx + 1} of ${total}`}>
            <div className="progressfill" style={{ width: `${((idx + (phase === "answering" ? 0 : 1)) / total) * 100}%` }} />
          </div>
          <div className="row wrap" style={{ marginTop: "0.6rem" }}>
            <span className="chip">
              Question {idx + 1} of {total}
            </span>
            <span className="chip">{categoryLabel}</span>
            {scores.length > 0 && (
              <span className="chip">
                running avg{" "}
                <span className="mono">{Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {err && (
        <div className="callout error">
          <p>{err}</p>
        </div>
      )}

      {phase === "answering" && current && (
        <>
          <div className="card interview-q">
            <h1 className="qhead">{current.prompt}</h1>
          </div>
          <div className="card">
            <VoiceAnswer onSubmit={submitAnswer} submitting={submitting} submitLabel="Submit answer" />
          </div>
        </>
      )}

      {phase === "followup" && graded?.followup?.question && (
        <>
          <div className="card interview-q followup">
            <div className="eyebrow">Follow-up</div>
            <h1 className="qhead">{graded.followup.question}</h1>
            <p className="sub" style={{ marginTop: "0.5rem" }}>
              Asked because: {graded.followup.reason}
            </p>
          </div>
          <div className="card">
            <VoiceAnswer
              onSubmit={submitFollowUp}
              submitting={submitting}
              submitLabel="Answer follow-up"
              compact
            />
          </div>
          <button className="ghost" onClick={() => setPhase("reviewing")}>
            Skip the follow-up
          </button>
        </>
      )}

      {phase === "reviewing" && graded && (
        <>
          <div className="card interview-q">
            <div className="eyebrow">You answered</div>
            <h2 className="qhead">{current?.prompt}</h2>
          </div>
          <AnswerGrade
            score={graded.score}
            breakdown={graded.breakdown}
            dimensionNotes={graded.dimensionNotes}
            feedback={graded.feedback}
            metrics={graded.metrics}
            rubric={rubric}
          />
          {!graded.followup?.asked && graded.followup?.reason && (
            <p className="sub">No follow-up: {graded.followup.reason}</p>
          )}
          {flaggable && current && (
            <div className="card row wrap">
              <div>
                <strong style={{ fontSize: "var(--t-base)" }}>Didn&apos;t land?</strong>
                <p className="sub" style={{ margin: "0.15rem 0 0" }}>
                  Flag it now and review it in study mode after the interview.
                </p>
              </div>
              <div className="spacer" />
              <FlagControl questionId={current.id} />
            </div>
          )}
          <div className="row no-print">
            <button className="primary" onClick={next}>
              {idx + 1 < total ? "Next question →" : "Finish and debrief"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
