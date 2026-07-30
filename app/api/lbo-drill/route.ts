import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { generateScenario, computeAnswers, CHECKED_FIELDS, checkAnswer } from "@/lib/lbo";

export const runtime = "nodejs";

// POST { action: "new", difficulty } -> creates and returns a scenario (answers hidden)
// POST { action: "grade", id, submitted, timeTakenSec } -> checks and persists
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supa = serviceClient();

    if (body.action === "new") {
      const scenario = generateScenario(body.difficulty ?? "medium", body.industry || undefined);
      const correct = computeAnswers(scenario);
      const { data, error } = await supa
        .from("lbo_drills")
        .insert({ scenario, correct, difficulty: body.difficulty ?? "medium" })
        .select("id, scenario, difficulty")
        .single();
      if (error) throw error;
      return NextResponse.json({ drill: data }); // note: correct answers NOT returned
    }

    if (body.action === "grade") {
      const { data: drill, error } = await supa.from("lbo_drills").select("*").eq("id", body.id).single();
      if (error || !drill) throw error ?? new Error("Drill not found");

      const truth = drill.correct;
      const correctness: Record<string, boolean> = {};
      let passCount = 0;
      for (const f of CHECKED_FIELDS) {
        const val = Number(body.submitted?.[f.key]);
        const ok = Number.isFinite(val) ? checkAnswer(f, val, truth) : false;
        correctness[f.key] = ok;
        if (ok) passCount++;
      }
      const passed = passCount === CHECKED_FIELDS.length;

      await supa
        .from("lbo_drills")
        .update({
          submitted: body.submitted,
          correctness,
          passed,
          time_taken_sec: body.timeTakenSec ?? null,
        })
        .eq("id", body.id);

      return NextResponse.json({ correctness, passed, correct: truth, passCount, total: CHECKED_FIELDS.length });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Drill failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
