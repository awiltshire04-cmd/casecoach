import { NextResponse } from "next/server";
import { jsonCall, MODELS } from "@/lib/anthropic";
import { serviceClient } from "@/lib/supabase";
import { buildParamsMessages, buildRenderMessages, buildConventions } from "@/lib/modeltest/prompts";
import { solve, validateAndClamp } from "@/lib/modeltest/solver";
import { PHASE_A_KEYS, type CaseStructured, type GenerateTestParams } from "@/lib/modeltest/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const params = (await req.json()) as GenerateTestParams;
    params.concepts = (params.concepts ?? []).filter((k) => PHASE_A_KEYS.includes(k));
    if (!params.concepts.length) {
      return NextResponse.json({ error: "Select at least one concept." }, { status: 400 });
    }

    // Weak-concept nudge from prior grades (best effort).
    const supa = serviceClient();
    let weak: string[] = [];
    try {
      const { data } = await supa
        .from("model_test_attempts")
        .select("grade")
        .eq("status", "graded")
        .order("opened_at", { ascending: false })
        .limit(5);
      const bad = new Map<string, number>();
      for (const row of data ?? []) {
        const concepts = (row.grade as { concepts?: { key: string; verdict: string }[] })?.concepts ?? [];
        for (const c of concepts) {
          if (c.verdict === "incorrect" || c.verdict === "not_found") bad.set(c.key, (bad.get(c.key) ?? 0) + 1);
        }
      }
      weak = [...bad.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
    } catch { /* table may not exist yet */ }

    // Stage 1 (+ solve), with one retry on solver rejection.
    const attempt = async (): Promise<{ structured: CaseStructured; solution: ReturnType<typeof solve> }> => {
      const { system, user } = buildParamsMessages(params, weak);
      const raw = await jsonCall<CaseStructured>({ model: MODELS.generate, system, user, maxTokens: 4096 });
      const structured = validateAndClamp(raw);
      const solution = solve(structured);
      return { structured, solution };
    };

    let structured: CaseStructured, solution: ReturnType<typeof solve>;
    try {
      ({ structured, solution } = await attempt());
    } catch (e1) {
      // Regenerate once — the validator/solver rejected the first scenario.
      try {
        ({ structured, solution } = await attempt());
      } catch (e2) {
        const msg = e2 instanceof Error ? e2.message : String(e2);
        return NextResponse.json({ error: `Case generation failed solver validation twice: ${msg}` }, { status: 500 });
      }
    }

    structured.conventions = buildConventions(structured);

    // Stage 3: render presentation.
    const r = buildRenderMessages(structured, solution, params.presentation);
    const rendered = await jsonCall<{ pages: { title: string; body: string }[] }>({
      model: MODELS.generate, system: r.system, user: r.user, maxTokens: 8000,
    });
    if (!rendered?.pages?.length) {
      return NextResponse.json({ error: "Renderer returned no pages." }, { status: 500 });
    }
    // Deterministic final page: conventions + required outputs block (grading contract).
    rendered.pages.push({
      title: "Modelling Conventions & Required Outputs",
      body:
        "**Conventions (follow these so your model matches the grader):**\n\n" +
        structured.conventions.map((c) => `- ${c}`).join("\n") +
        "\n\n**Required outputs.** Keep a summary block somewhere in your workbook with each label below in its own cell and the value within six cells to its right (this is how the grader reads your file):\n\n" +
        solution.checkpoints.map((c) => `- ${c.label}`).join("\n") +
        "\n\nPercentages may be entered as % or decimal. Then write your investment memo in the submission box.",
    });

    const { data, error } = await supa
      .from("model_tests")
      .insert({
        params,
        case_structured: structured,
        case_rendered: rendered,
        quirks: structured.quirks ?? [],
        conventions: structured.conventions,
        reference_solution: solution,
      })
      .select("id")
      .single();
    if (error) {
      return NextResponse.json({ error: `Generated but failed to save: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({
      id: data.id,
      pages: rendered.pages,
      quirks: structured.quirks ?? [],
      company: structured.company,
      hold_years: structured.hold_years,
      difficulty: params.difficulty,
      presentation: params.presentation,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
