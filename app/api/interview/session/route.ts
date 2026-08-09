import { NextResponse } from "next/server";
import { jsonCall, MODELS } from "@/lib/anthropic";
import { serviceClient } from "@/lib/supabase";
import { buildSessionSummaryMessages } from "@/lib/interview/prompts";
import type { SessionOverall } from "@/lib/interview/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST { action: "start" | "finish" }
// start  → creates the session row and returns the randomly drawn questions
// finish → grades the session as a whole and closes it out
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action: "start" | "finish";
      section?: string;
      count?: number;
      category?: string | null;
      sessionId?: string;
    };
    const supa = serviceClient();

    if (body.action === "start") {
      const section = body.section ?? "behavioral";
      const count = Math.max(1, Math.min(20, body.count ?? 5));

      // Lean fields only: the interview screen renders prompts, and grading
      // reads guidance server-side from the question row.
      let q = supa
        .from("questions")
        .select("id, section, category, prompt, difficulty, source, source_ref, concept_tags")
        .eq("section", section)
        .eq("active", true);
      if (body.category) q = q.eq("category", body.category);

      const { data, error } = await q;
      if (error) {
        if (error.code === "PGRST205" || /could not find the table/i.test(error.message)) {
          return NextResponse.json(
            { error: "The question bank table doesn't exist yet. Run supabase/migration_004_interview_bank.sql.", setup: true },
            { status: 503 }
          );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const pool = [...(data ?? [])];
      if (pool.length === 0) return NextResponse.json({ error: "No questions in the bank yet." }, { status: 404 });
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const questions = pool.slice(0, count);

      const { data: sess, error: sErr } = await supa
        .from("interview_sessions")
        .insert({ section, planned_count: questions.length })
        .select("id, created_at")
        .single();
      if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

      return NextResponse.json({ sessionId: sess.id, questions });
    }

    if (body.action === "finish") {
      if (!body.sessionId) return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });

      const { data: sessionRow } = await supa
        .from("interview_sessions")
        .select("section")
        .eq("id", body.sessionId)
        .single();
      const sectionLabel = (sessionRow as { section?: string } | null)?.section === "technical" ? "technical" : "behavioral";

      const { data: attempts, error } = await supa
        .from("question_attempts")
        .select("id, question_id, score, breakdown, feedback, transcript, ordinal, followup, questions(prompt, category)")
        .eq("session_id", body.sessionId)
        .order("ordinal", { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      type Row = {
        id: string; question_id: string; score: number | null; breakdown: Record<string, number> | null;
        feedback: Record<string, unknown> | null; transcript: string; ordinal: number | null;
        followup: { asked?: boolean; question?: string | null } | null;
        questions: { prompt: string; category: string } | null;
      };
      const all = (attempts ?? []) as unknown as Row[];
      const rows = all.filter((r) => typeof r.score === "number");
      const ungraded = all.length - rows.length;
      if (rows.length === 0) {
        await supa
          .from("interview_sessions")
          .update({ status: "abandoned", completed_at: new Date().toISOString() })
          .eq("id", body.sessionId);
        return NextResponse.json({ overall: null, note: "No graded answers in this session." });
      }

      const score = Math.round(rows.reduce((a, r) => a + (r.score ?? 0), 0) / rows.length);

      let overall: SessionOverall = { score, summary: "", strengths: [], priorities: [] };
      try {
        const msgs = buildSessionSummaryMessages({
          sectionLabel,
          items: rows.map((r) => ({
            prompt: r.questions?.prompt ?? "(question)",
            score: r.score ?? 0,
            breakdown: r.breakdown ?? {},
            transcript: r.transcript,
          })),
        });
        const res = await jsonCall<Omit<SessionOverall, "score">>({
          model: MODELS.grade,
          system: msgs.system,
          user: msgs.user,
          maxTokens: 1536,
        });
        overall = { score, summary: res.summary ?? "", strengths: res.strengths ?? [], priorities: res.priorities ?? [] };
      } catch {
        overall.summary = "Per-question feedback is saved; the overall debrief could not be generated this time.";
      }

      await supa
        .from("interview_sessions")
        .update({ status: "complete", completed_at: new Date().toISOString(), overall })
        .eq("id", body.sessionId);

      // Per-question detail travels with the debrief now that it isn't shown
      // inline after each answer.
      const perQuestion = rows.map((r) => ({
        id: r.id,
        questionId: r.question_id,
        ordinal: r.ordinal,
        prompt: r.questions?.prompt ?? "(question)",
        category: r.questions?.category ?? "",
        score: r.score ?? 0,
        breakdown: r.breakdown ?? {},
        feedback: r.feedback ?? null,
        followupAsked: Boolean(r.followup?.asked),
        followupQuestion: r.followup?.question ?? null,
      }));

      return NextResponse.json({ overall, perQuestion, ungraded });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
