import { NextResponse } from "next/server";
import { textCall, MODELS } from "@/lib/anthropic";
import { serviceClient } from "@/lib/supabase";
import { buildHintMessages } from "@/lib/modeltest/prompts";
import type { CaseStructured, ReferenceSolution } from "@/lib/modeltest/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { testId, quirkId } = (await req.json()) as { testId: string; quirkId: string };
    const supa = serviceClient();
    const { data: test, error } = await supa
      .from("model_tests")
      .select("case_structured, reference_solution, hints_cache")
      .eq("id", testId)
      .single();
    if (error || !test) return NextResponse.json({ error: "Test not found." }, { status: 404 });

    const cache = (test.hints_cache ?? {}) as Record<string, string>;
    if (cache[quirkId]) return NextResponse.json({ hint: cache[quirkId], cached: true });

    const { system, user } = buildHintMessages(
      test.case_structured as CaseStructured,
      test.reference_solution as ReferenceSolution,
      quirkId
    );
    const hint = await textCall({ model: MODELS.generate, system, user, maxTokens: 1024 });

    cache[quirkId] = hint;
    await supa.from("model_tests").update({ hints_cache: cache }).eq("id", testId);
    return NextResponse.json({ hint, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
