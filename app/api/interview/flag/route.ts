import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Flags hang off the most recent attempt at a question. A question you've never
// answered can still be flagged — sometimes you read it and know immediately you
// don't understand it — so we create a bare attempt row to carry the flag.
//
// POST { questionId, flagged, reason?: "wrong" | "unclear" }
export async function POST(req: Request) {
  try {
    const { questionId, flagged, reason } = (await req.json()) as {
      questionId: string;
      flagged: boolean;
      reason?: "wrong" | "unclear";
    };
    if (!questionId) return NextResponse.json({ error: "Missing questionId." }, { status: 400 });

    const supa = serviceClient();
    const { data: latest } = await supa
      .from("question_attempts")
      .select("id")
      .eq("question_id", questionId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (latest && latest.length > 0) {
      const { error } = await supa
        .from("question_attempts")
        .update({ flagged, flag_reason: flagged ? reason ?? "wrong" : null })
        .eq("id", latest[0].id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, flagged });
    }

    if (!flagged) return NextResponse.json({ ok: true, flagged: false });

    const { error } = await supa.from("question_attempts").insert({
      question_id: questionId,
      transcript: "",
      input_mode: "typed",
      flagged: true,
      flag_reason: reason ?? "unclear",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, flagged: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/interview/flag?section=technical — the study list.
export async function GET(req: Request) {
  try {
    const section = new URL(req.url).searchParams.get("section") ?? "technical";
    const supa = serviceClient();

    const { data, error } = await supa
      .from("question_attempts")
      .select(
        "id, created_at, flag_reason, score, questions!inner(*)"
      )
      .eq("flagged", true)
      .eq("questions.section", section)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    type Raw = {
      id: string; created_at: string; flag_reason: string | null; score: number | null;
      questions: {
        id: string; section: string; category: string; prompt: string; difficulty: string;
        source: string; source_ref: string | null; concept_tags: string[];
        guidance: string | null; explanation: string | null;
      };
    };

    // One entry per question — the newest flag wins if a question was flagged twice.
    const seen = new Set<string>();
    const items = [];
    for (const r of (data ?? []) as unknown as Raw[]) {
      if (!r.questions || seen.has(r.questions.id)) continue;
      seen.add(r.questions.id);
      items.push({
        attemptId: r.id,
        flaggedAt: r.created_at,
        reason: r.flag_reason,
        lastScore: r.score,
        question: r.questions,
      });
    }

    return NextResponse.json({ items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
