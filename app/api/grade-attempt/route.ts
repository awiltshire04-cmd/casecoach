import { NextResponse } from "next/server";
import { jsonCall, MODELS } from "@/lib/anthropic";
import { serviceClient, exhibitsToText } from "@/lib/supabase";
import { buildGradingMessages, computeTotal } from "@/lib/prompts";
import type { GradeResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      caseId: string;
      response: string;
      selfScore?: number | null;
      timeAllottedSec: number;
      timeTakenSec: number;
    };

    const supa = serviceClient();

    // Load the case (and its stored rubric — the fair-grading contract).
    const { data: c, error: cErr } = await supa
      .from("cases")
      .select("*")
      .eq("id", body.caseId)
      .single();
    if (cErr || !c) throw cErr ?? new Error("Case not found");

    const exhibitsText = exhibitsToText(c.exhibits ?? []);
    const { system, user } = buildGradingMessages({
      caseType: c.type,
      prompt: c.prompt,
      exhibitsText,
      rubric: c.rubric,
      hiddenTraps: c.hidden_traps ?? [],
      response: body.response,
    });

    const graded = await jsonCall<Omit<GradeResult, "total"> & { missed_traps?: string[] }>({
      model: MODELS.grade,
      system,
      user,
      maxTokens: 3072,
    });

    const total = computeTotal(graded.dimension_scores, c.rubric);

    const { data: attempt, error: aErr } = await supa
      .from("attempts")
      .insert({
        case_id: body.caseId,
        response: body.response,
        self_score: body.selfScore ?? null,
        ai_score: total,
        dimension_scores: graded.dimension_scores,
        feedback: {
          dimensions: graded.dimension_feedback,
          tests_callouts: graded.tests_callouts,
        },
        missed_traps: graded.missed_traps ?? [],
        time_allotted_sec: body.timeAllottedSec,
        time_taken_sec: body.timeTakenSec,
        submitted_early: body.timeTakenSec < body.timeAllottedSec,
      })
      .select()
      .single();
    if (aErr) throw aErr;

    return NextResponse.json({ attempt, total });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Grading failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
