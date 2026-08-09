"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/http";
import { scoreClass } from "@/components/Pieces";
import { VoiceAnswer, type VoiceAnswerHandle } from "@/components/VoiceAnswer";
import { FlagControl } from "@/components/interview/FlagControl";
import {
  rubricFor,
  type AnswerFeedback,
  type Question,
  type Section,
  type SessionOverall,
} from "@/lib/interview/types";

interface Deferred {
  attemptId: string;
  deferred: true;
  followup: { asked: boolean; reason: string; question: string | null } | null;
}

export interface PerQuestion {
  id: string;
  questionId: string;
  ordinal: number | null;
  prompt: string;
  category: string;
  score: number;
  breakdown: Record<string, number>;
  feedback: (AnswerFeedback & { dimension_notes?: Record<string, string> }) | null;
  followupAsked: boolean;
  followupQuestion: string | null;
}

type Phase = "answering" | "followup" | "finishing" | "done";

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
  const [followup, setFollowup] = useState<Deferred["followup"]>(null);
  const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [gradedCount, setGradedCount] = useState(0);
  const [perQuestion, setPerQuestion] = useState<PerQuestion[]>([]);
  const [overall, setOverall] = useState<SessionOverall | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** In-flight background grade requests, awaited once at the end. */
  const pending = useRef<Promise<unknown>[]>([]);

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
      // Fast path: store the answer and decide the probe (~3s). The full grade
      // is fired below without awaiting, so it never blocks the next question.
      const res = await apiFetch<Deferred>("/api/interview/attempt", {
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
          defer: true,
        }),
      });

      setLastAttemptId(res.attemptId);
      setFollowup(res.followup ?? null);

      const p = apiFetch("/api/interview/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: res.attemptId }),
      })
        .then(() => setGradedCount((n) => n + 1))
        .catch(() => {
          /* surfaced at the debrief as an ungraded answer */
        });
      pending.current.push(p);

      if (res.followup?.asked && res.followup.question) {
        setPhase("followup");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        await advance();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save that answer");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitFollowUp(answer: VoiceAnswerHandle) {
    if (!lastAttemptId) return;
    setSubmitting(true);
    try {
      await apiFetch("/api/interview/attempt", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: lastAttemptId, transcript: answer.transcript }),
      });
    } catch {
      /* the follow-up is colour on the attempt, not the grade — don't block */
    } finally {
      setSubmitting(false);
      await advance();
    }
  }

  /** Move to the next question, or close the session out. */
  async function advance() {
    if (!questions) return;
    if (idx + 1 < questions.length) {
      const ni = idx + 1;
      setIdx(ni);
      setFollowup(null);
      setLastAttemptId(null);
      setPhase("answering");
      persist(questions, ni, scores);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setPhase("finishing");
    // Grades are still in flight; wait for them here rather than between
    // questions, which is where the waiting actually hurt.
    await Promise.allSettled(pending.current);
    try {
      const res = await apiFetch<{
        overall: SessionOverall | null;
        perQuestion?: PerQuestion[];
        ungraded?: number;
      }>("/api/interview/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finish", sessionId: id }),
      });
      setOverall(res.overall);
      setPerQuestion(res.perQuestion ?? []);
      setScores((res.perQuestion ?? []).map((q) => q.score));
      if (res.ungraded) setErr(`${res.ungraded} answer(s) couldn't be graded and are excluded from the average.`);
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

            {perQuestion.length > 0 && (
              <div className="stack">
                <div className="section-head">
                  <h2>Question by question</h2>
                  <span className="sub">Graded while you kept going</span>
                </div>
                {perQuestion.map((q, i) => (
                  <details className="card qreview" key={q.id}>
                    <summary>
                      <span className={`scorepill ${scoreClass(q.score)}`}>{q.score}</span>
                      <span className="qr-prompt">
                        Q{q.ordinal ?? i + 1}. {q.prompt}
                      </span>
                      {q.followupAsked && <span className="chip">probed</span>}
                    </summary>
                    <div className="stack" style={{ marginTop: "var(--s3)" }}>
                      <div className="dimbars">
                        {rubric.map((d) => (
                          <div className="dimbar" key={d.key}>
                            <span className="lbl">{d.label}</span>
                            <span className="track">
                              <span className="fill" style={{ width: `${q.breakdown[d.key] ?? 0}%` }} />
                            </span>
                            <span className="val">{q.breakdown[d.key] ?? "—"}</span>
                          </div>
                        ))}
                      </div>
                      {q.feedback?.dimension_notes &&
                        rubric.map((d) =>
                          q.feedback?.dimension_notes?.[d.key] ? (
                            <p key={d.key} style={{ margin: 0, fontSize: "var(--t-base)" }}>
                              <strong>{d.label}:</strong>{" "}
                              <span style={{ color: "var(--ink-2)" }}>{q.feedback.dimension_notes[d.key]}</span>
                            </p>
                          ) : null
                        )}
                      {q.feedback?.add?.length ? (
                        <div className="callout" style={{ borderLeft: "3px solid var(--accent)" }}>
                          <h4>What would have raised it</h4>
                          <ul className="fb-list">
                            {q.feedback.add.map((t, j) => <li key={j}>{t}</li>)}
                          </ul>
                        </div>
                      ) : null}
                      {flaggable && (
                        <div className="row">
                          <div className="spacer" />
                          <FlagControl questionId={q.questionId} label="Flag for study" />
                        </div>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            )}

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
            {/* Scores arrive at the debrief now, so show grading progress
                instead of a running average that would always read zero. */}
            {idx > 0 && (
              <span className="chip">
                {gradedCount < idx ? (
                  <>
                    <span className="spin" /> grading {gradedCount}/{idx}
                  </>
                ) : (
                  <>{gradedCount} graded in the background</>
                )}
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

      {phase === "followup" && followup?.question && (
        <>
          <div className="card interview-q followup">
            <div className="eyebrow">Follow-up</div>
            <h1 className="qhead">{followup.question}</h1>
            <p className="sub" style={{ marginTop: "0.5rem" }}>Asked because: {followup.reason}</p>
          </div>
          <div className="card">
            <VoiceAnswer
              onSubmit={submitFollowUp}
              submitting={submitting}
              submitLabel="Answer follow-up"
              compact
            />
          </div>
          <div className="row">
            {flaggable && current && <FlagControl questionId={current.id} label="Flag this question" />}
            <div className="spacer" />
            <button className="ghost" onClick={advance} disabled={submitting}>
              Skip the follow-up
            </button>
          </div>
        </>
      )}

    </div>
  );
}
