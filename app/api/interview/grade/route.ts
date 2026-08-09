import { NextResponse } from "next/server";
import { jsonCall, MODELS } from "@/lib/anthropic";
import { serviceClient } from "@/lib/supabase";
import { weightedScore } from "@/lib/interview/metrics";
import { buildAnswerGradingMessages } from "@/lib/interview/prompts";
import { rubricFor, type AnswerFeedback, type Question, type SpeechMetrics } from "@/lib/interview/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// Grades an answer that was already stored by the deferred path. The client
// fires this without awaiting it, so the candidate moves to the next question
// while grading runs — the ~13s call leaves the critical path entirely.
export async function POST(req: Request) {
  try {
    const { attemptId } = (await req.json()) as { attemptId: string };
    if (!attemptId) return NextResponse.json({ error: "Missing attemptId." }, { status: 400 });

    const supa = serviceClient();
    const { data: attempt, error } = await supa
      .from("question_attempts")
      .select("id, transcript, input_mode, metrics, score, questions(*)")
      .eq("id", attemptId)
      .single();
    if (error || !attempt) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });

    // Idempotent: a retry (or a double-fire from the client) must not re-bill.
    if (typeof (attempt as { score: number | null }).score === "number") {
      return NextResponse.json({ alreadyGraded: true });
    }

    const question = (attempt as unknown as { questions: Question }).questions;
    if (!question) return NextResponse.json({ error: "Question missing for attempt." }, { status: 404 });

    const transcript = (attempt as { transcript: string }).transcript ?? "";
    const metrics = (attempt as unknown as { metrics: SpeechMetrics }).metrics;
    const inputMode = ((attempt as { input_mode?: string }).input_mode as "voice" | "typed") ?? "voice";
    const rubric = rubricFor(question.section);

    const msgs = buildAnswerGradingMessages({
      question,
      transcript,
      metrics,
      rubric,
      sectionLabel: question.section === "technical" ? "technical" : "behavioral",
      inputMode,
    });

    const graded = await jsonCall<{
      breakdown: Record<string, number>;
      dimension_notes: Record<string, string>;
      feedback: AnswerFeedback;
    }>({ model: MODELS.grade, system: msgs.system, user: msgs.user, maxTokens: 2048 });

    for (const d of rubric) if (typeof graded.breakdown?.[d.key] !== "number") graded.breakdown[d.key] = 0;
    const score = weightedScore(graded.breakdown ?? {}, rubric);

    // dimension_notes rides inside the feedback JSONB rather than earning a
    // column — the debrief needs it, and this needs no migration.
    const { error: upErr } = await supa
      .from("question_attempts")
      .update({
        score,
        breakdown: graded.breakdown ?? {},
        feedback: { ...(graded.feedback ?? {}), dimension_notes: graded.dimension_notes ?? {} },
      })
      .eq("id", attemptId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({
      attemptId,
      score,
      breakdown: graded.breakdown ?? {},
      dimensionNotes: graded.dimension_notes ?? {},
      feedback: graded.feedback ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
