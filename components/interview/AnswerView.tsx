"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/http";
import { VoiceAnswer, type VoiceAnswerHandle } from "@/components/VoiceAnswer";
import { AnswerGrade } from "@/components/AnswerGrade";
import { FlagControl } from "@/components/interview/FlagControl";
import { rubricFor, type AnswerFeedback, type Question, type Section, type SpeechMetrics } from "@/lib/interview/types";

interface Graded {
  attemptId: string;
  score: number;
  breakdown: Record<string, number>;
  dimensionNotes: Record<string, string>;
  feedback: AnswerFeedback | null;
  metrics: SpeechMetrics | null;
}

// Shared single-question answering screen for both sections.
export function AnswerView({
  section,
  questionId,
  categories,
  flaggable = false,
}: {
  section: Section;
  questionId: string;
  categories: { key: string; label: string }[];
  flaggable?: boolean;
}) {
  const router = useRouter();
  const [question, setQuestion] = useState<Question | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [graded, setGraded] = useState<Graded | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ questions: Question[] }>(`/api/interview/questions?section=${section}`);
        const found = (res.questions ?? []).find((q) => q.id === questionId) ?? null;
        if (!found) throw new Error("That question isn't in the bank.");
        setQuestion(found);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load the question");
      }
    })();
  }, [questionId, section]);

  async function submit(answer: VoiceAnswerHandle) {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await apiFetch<Graded>("/api/interview/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId,
          transcript: answer.transcript,
          durationSec: answer.durationSec,
          inputMode: answer.mode,
          allowFollowUp: false,
        }),
      });
      setGraded(res);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Grading failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (err && !question) return <div className="callout error">{err}</div>;
  if (!question) {
    return (
      <div className="stack">
        <div className="skel skel-line w-40" />
        <div className="skel skel-block" />
      </div>
    );
  }

  const categoryLabel = categories.find((c) => c.key === question.category)?.label ?? question.category;
  const sectionLabel = section === "technical" ? "Technical" : "Behavioral";

  return (
    <div className="stack loose">
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {sectionLabel} · {categoryLabel}
            {question.source === "generated" && " · extension"}
          </div>
          <h1 className="qhead">{question.prompt}</h1>
          {question.source_ref && question.source === "book" && (
            <p className="sub" style={{ marginTop: "0.4rem" }}>From the handbook — {question.source_ref}</p>
          )}
        </div>
        <button className="ghost no-print" onClick={() => router.push(`/${section}`)}>
          ← Back to bank
        </button>
      </div>

      {err && (
        <div className="callout error">
          <p>{err}</p>
        </div>
      )}

      {graded ? (
        <>
          <AnswerGrade
            score={graded.score}
            breakdown={graded.breakdown}
            dimensionNotes={graded.dimensionNotes}
            feedback={graded.feedback}
            metrics={graded.metrics}
            rubric={rubricFor(section)}
          />

          {flaggable && (
            <div className="card stack">
              <div className="row wrap">
                <div>
                  <h3>Didn&apos;t land?</h3>
                  <p className="sub" style={{ margin: "0.2rem 0 0" }}>
                    Flag it and this question joins study mode until you clear it.
                  </p>
                </div>
                <div className="spacer" />
                <FlagControl questionId={question.id} />
              </div>
              {question.explanation && (
                <>
                  <button className="ghost" onClick={() => setShowExplanation((s) => !s)} style={{ alignSelf: "flex-start" }}>
                    {showExplanation ? "Hide the explanation" : "Show me the correct answer"}
                  </button>
                  {showExplanation && (
                    <div className="callout accent">
                      <h4>The concept</h4>
                      <p>{question.explanation}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="row no-print">
            <button className="primary" onClick={() => { setGraded(null); setShowExplanation(false); }}>
              Answer again
            </button>
            <button onClick={() => router.push(`/${section}`)}>Another question</button>
            <div className="spacer" />
            <button className="ghost" onClick={() => router.push("/")}>See progress</button>
          </div>
        </>
      ) : (
        <>
          <div className="card">
            <VoiceAnswer onSubmit={submit} submitting={submitting} />
          </div>
          <div className="row wrap">
            {flaggable && <FlagControl questionId={question.id} label="I don't understand this one" />}
          </div>
          {question.guidance && (
            <details className="tweak">
              <summary>What a strong answer contains</summary>
              <p style={{ margin: "0.5rem 0 0", fontSize: "var(--t-base)", color: "var(--ink-2)" }}>
                {question.guidance}
              </p>
              <p className="sub" style={{ marginTop: "0.4rem" }}>
                Reading this first makes the rep easier than the real thing — try answering cold, then check.
              </p>
            </details>
          )}
        </>
      )}
    </div>
  );
}
