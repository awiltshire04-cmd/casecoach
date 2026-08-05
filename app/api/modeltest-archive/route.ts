import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";

export const runtime = "nodejs";

// Model-test reads go through the service role rather than the browser's anon
// key. model_tests / model_test_attempts have RLS enabled with no policies, so
// anon reads return 200 with zero rows — the archive looked empty even though
// the rows were there. Reading server-side is also why we don't have to widen
// anon access to these tables.
//
// GET /api/modeltest-archive              → list for the archive table
// GET /api/modeltest-archive?attemptId=x  → one attempt + its test, for the detail view
export async function GET(req: Request) {
  try {
    const supa = serviceClient();
    const attemptId = new URL(req.url).searchParams.get("attemptId");

    if (attemptId) {
      const { data, error } = await supa
        .from("model_test_attempts")
        .select("*, model_tests(params, case_structured, case_rendered)")
        .eq("id", attemptId)
        .single();
      if (error || !data) {
        return NextResponse.json({ error: error?.message ?? "Attempt not found." }, { status: 404 });
      }
      const { model_tests, ...attempt } = data as Record<string, unknown>;
      return NextResponse.json({ attempt, test: model_tests });
    }

    const { data, error } = await supa
      .from("model_test_attempts")
      .select("id, opened_at, status, time_taken_sec, grade, model_tests(params, case_structured)")
      .order("opened_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    type Raw = {
      id: string; opened_at: string; status: string; time_taken_sec: number | null;
      grade: { total?: number } | null;
      model_tests: {
        params: { concepts?: string[]; difficulty?: string; presentation?: string; industry?: string } | null;
        case_structured: { company?: string } | null;
      } | null;
    };

    const rows = ((data ?? []) as unknown as Raw[]).map((m) => ({
      id: m.id,
      opened_at: m.opened_at,
      status: m.status,
      time_taken_sec: m.time_taken_sec,
      total: m.grade?.total ?? null,
      company: m.model_tests?.case_structured?.company ?? "—",
      concepts: m.model_tests?.params?.concepts ?? [],
      difficulty: m.model_tests?.params?.difficulty ?? "",
      presentation: m.model_tests?.params?.presentation ?? "",
      industry: m.model_tests?.params?.industry ?? "",
    }));

    return NextResponse.json({ rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
