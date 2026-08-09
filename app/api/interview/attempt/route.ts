import { NextResponse } from "next/server";
import { jsonCall, MODELS } from "@/lib/anthropic";
import { serviceClient } from "@/lib/supabase";
import { speechMetrics, weightedScore } from "@/lib/interview/metrics";
import { buildAnswerGradingMessages, buildFollowUpMessages } from "@/lib/interview/prompts";
import { rubricFor, type AnswerFeedback, type Question } from "@/lib/interview/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  questionId: string;
  transcript: string;
  durationSec: number;
  inputMode?: "voice" | "typed";
  sessionId?: string | null;
  ordinal?: number | null;
  /** When set, the interviewer may probe. Standalone practice never follows up. */
  allowFollowUp?: boolean;
  /** Interview mode: save the answer and decide the follow-up now (fast), and
   *  leave the full grade to POST /api/interview/grade so the candidate isn't
   *  watching a spinner between questions. */
  defer?: boolean;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const transcript = (body.transcript ?? "").trim();
    if (!body.questionId) return NextResponse.json({ error: "Missing questionId." }, { status: 400 });
    if (transcript.split(/\s+/).filter(Boolean).length < 10) {
      return NextResponse.json(
        { error: "That answer is too short to grade — give it at least a couple of sentences." },
        { status: 400 }
      );
    }

    const supa = serviceClient();
    const { data: qRow, error: qErr } = await supa
      .from("questions")
      .select("*")  // `*` so a pre-migration-005 database (no `explanation` column) still works
      .eq("id", body.questionId)
      .single();
    if (qErr || !qRow) return NextResponse.json({ error: "Question not found." }, { status: 404 });
    const question = qRow as Question;

    const inputMode = body.inputMode ?? "voice";
    const metrics = speechMetrics(transcript, body.durationSec ?? 0);
    const rubric = rubricFor(question.section); // technical weights correctness over narrative

    // ---- deferred path: store the answer, decide the probe, return fast ----
    if (body.defer) {
      const { data: row, error: insErr } = await supa
        .from("question_attempts")
        .insert({
          question_id: question.id,
          session_id: body.sessionId ?? null,
          ordinal: body.ordinal ?? null,
          transcript,
          input_mode: inputMode,
          duration_sec: metrics.durationSec,
          word_count: metrics.wordCount,
          metrics,
        })
        .select("id")
        .single();
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

      let followup: { asked: boolean; reason: string; question: string | null } = {
        asked: false, reason: "", question: null,
      };
      if (body.allowFollowUp) {
        try {
          const fu = buildFollowUpMessages({ question, transcript, breakdown: {} });
          const decision = await jsonCall<{ needed: boolean; reason: string; question: string | null }>({
            model: MODELS.grade, system: fu.system, user: fu.user, maxTokens: 700,
          });
          followup = {
            asked: Boolean(decision.needed && decision.question),
            reason: decision.reason ?? "",
            question: decision.needed ? decision.question : null,
          };
        } catch {
          /* a failed probe shouldn't block the interview */
        }
        await supa.from("question_attempts").update({ followup }).eq("id", row.id);
      }

      return NextResponse.json({ attemptId: row.id, deferred: true, followup });
    }

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
    // Guard against a model that answers with the other section's dimension keys.
    for (const d of rubric) if (typeof graded.breakdown?.[d.key] !== "number") graded.breakdown[d.key] = 0;

    // Total is computed here, not by the model, so it's reproducible.
    const score = weightedScore(graded.breakdown ?? {}, rubric);

    // Follow-up is a judgment call, and only in interview mode.
    let followup: { asked: boolean; reason: string; question: string | null } = {
      asked: false,
      reason: "",
      question: null,
    };
    if (body.allowFollowUp) {
      try {
        const fu = buildFollowUpMessages({ question, transcript, breakdown: graded.breakdown ?? {} });
        const decision = await jsonCall<{ needed: boolean; reason: string; question: string | null }>({
          model: MODELS.grade,
          system: fu.system,
          user: fu.user,
          maxTokens: 512,
        });
        followup = {
          asked: Boolean(decision.needed && decision.question),
          reason: decision.reason ?? "",
          question: decision.needed ? decision.question : null,
        };
      } catch {
        /* a failed probe shouldn't sink a graded answer */
      }
    }

    const { data: saved, error: insErr } = await supa
      .from("question_attempts")
      .insert({
        question_id: question.id,
        session_id: body.sessionId ?? null,
        ordinal: body.ordinal ?? null,
        transcript,
        input_mode: inputMode,
        duration_sec: metrics.durationSec,
        word_count: metrics.wordCount,
        score,
        breakdown: graded.breakdown ?? {},
        feedback: graded.feedback ?? null,
        metrics,
        followup,
      })
      .select("id")
      .single();
    if (insErr) return NextResponse.json({ error: `Graded but failed to save: ${insErr.message}` }, { status: 500 });

    return NextResponse.json({
      attemptId: saved.id,
      score,
      breakdown: graded.breakdown ?? {},
      dimensionNotes: graded.dimension_notes ?? {},
      feedback: graded.feedback ?? null,
      metrics,
      followup,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH stores the spoken answer to a follow-up against the original attempt.
export async function PATCH(req: Request) {
  try {
    const { attemptId, transcript } = (await req.json()) as { attemptId: string; transcript: string };
    if (!attemptId) return NextResponse.json({ error: "Missing attemptId." }, { status: 400 });

    const supa = serviceClient();
    const { data: row, error } = await supa
      .from("question_attempts")
      .select("followup")
      .eq("id", attemptId)
      .single();
    if (error || !row) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });

    const followup = { ...((row.followup as object) ?? {}), transcript: (transcript ?? "").trim() };
    const { error: upErr } = await supa.from("question_attempts").update({ followup }).eq("id", attemptId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
