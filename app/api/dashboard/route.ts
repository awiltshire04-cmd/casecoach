import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { CASE_TYPES } from "@/lib/types";
import type { ActivityEvent } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every practice surface feeds one activity stream. The client buckets these by
// local date for the heatmap and by category for the score breakdown, so the
// dashboard needs exactly one round trip and no timezone guessing server-side.
//
// Reads go through the service role: model_test_attempts has RLS on with no
// policies, so an anon read silently returns zero rows (see modeltest-archive).
export async function GET() {
  try {
    const supa = serviceClient();
    const events: ActivityEvent[] = [];
    const degraded: string[] = [];
    const missing: string[] = [];

    // A table that was never created is a setup gap, not a failure — report it
    // separately so the dashboard can phrase it as "not set up yet".
    const note = (label: string, err: { message: string; code?: string } | null) => {
      if (!err) return;
      if (err.code === "PGRST205" || /could not find the table/i.test(err.message)) missing.push(label);
      else degraded.push(`${label}: ${err.message}`);
    };

    // ---- case attempts ----
    const cases = await supa
      .from("attempt_history")
      .select("id, created_at, ai_score, type, title")
      .order("created_at", { ascending: false });
    note("Case practice", cases.error);
    for (const r of cases.data ?? []) {
      const row = r as { id: string; created_at: string; ai_score: number | null; type: string; title: string };
      events.push({
        id: row.id,
        category: "case",
        title: row.title,
        detail: CASE_TYPES.find((t) => t.value === row.type)?.label ?? row.type,
        score: row.ai_score,
        at: row.created_at,
        href: `/archive/case/${row.id}`,
      });
    }

    // ---- model tests (graded attempts only carry a score) ----
    const mts = await supa
      .from("model_test_attempts")
      .select("id, opened_at, submitted_at, status, grade, model_tests(case_structured, params)")
      .order("opened_at", { ascending: false });
    note("Model tests", mts.error);
    type MtRaw = {
      id: string; opened_at: string; submitted_at: string | null; status: string;
      grade: { total?: number } | null;
      model_tests: { case_structured: { company?: string } | null; params: { difficulty?: string } | null } | null;
    };
    for (const m of (mts.data ?? []) as unknown as MtRaw[]) {
      events.push({
        id: m.id,
        category: "model",
        title: m.model_tests?.case_structured?.company ?? "Model test",
        detail: m.model_tests?.params?.difficulty ?? m.status,
        score: typeof m.grade?.total === "number" ? m.grade.total : null,
        at: m.submitted_at ?? m.opened_at,
        href: `/archive/mt/${m.id}`,
      });
    }

    // ---- paper LBO drills ----
    const drills = await supa
      .from("lbo_drills")
      .select("id, created_at, difficulty, passed, correctness")
      .not("correctness", "is", null)
      .order("created_at", { ascending: false });
    note("Paper LBO", drills.error);
    type DrillRaw = {
      id: string; created_at: string; difficulty: string;
      passed: boolean | null; correctness: Record<string, boolean> | null;
    };
    for (const d of (drills.data ?? []) as unknown as DrillRaw[]) {
      const marks = Object.values(d.correctness ?? {});
      const score = marks.length ? Math.round((marks.filter(Boolean).length / marks.length) * 100) : null;
      events.push({
        id: d.id,
        category: "drill",
        title: "Paper LBO drill",
        detail: d.difficulty,
        score,
        at: d.created_at,
        href: null,
      });
    }

    // ---- behavioral / technical interview attempts ----
    const answers = await supa
      .from("question_attempts")
      .select("id, created_at, score, session_id, questions(section, category, prompt)")
      .order("created_at", { ascending: false });
    note("Interview practice", answers.error);
    type AnsRaw = {
      id: string; created_at: string; score: number | null; session_id: string | null;
      questions: { section: string; category: string; prompt: string } | null;
    };
    for (const a of (answers.data ?? []) as unknown as AnsRaw[]) {
      const section = a.questions?.section === "technical" ? "technical" : "behavioral";
      events.push({
        id: a.id,
        category: section,
        title: a.questions?.prompt ?? "Interview question",
        detail: a.session_id ? "interview mode" : "single question",
        score: a.score,
        at: a.created_at,
        href: section === "technical" ? "/technical" : "/behavioral",
      });
    }

    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return NextResponse.json({ events, degraded, missing });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
