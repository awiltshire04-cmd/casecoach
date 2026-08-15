import { NextResponse } from "next/server";
import { jsonCall, MODELS } from "@/lib/anthropic";
import { serviceClient } from "@/lib/supabase";
import { buildGenerationMessages } from "@/lib/prompts";
import {
  ARCHETYPES, VERDICT_SHAPES, pickVerdictShape,
  type GenerateParams, type GeneratedCase, type VerdictShape,
} from "@/lib/types";

export const runtime = "nodejs";
// A single generation call measures 55-75s, and jsonCall retries once on
// malformed JSON — 60s guarantees a platform timeout. Match the modeltest routes.
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const params = (await req.json()) as GenerateParams;

    // Spaced repetition: pull this candidate's frequently-missed traps for this type.
    const supaLookup = serviceClient();
    let weakTraps: string[] = [];
    try {
      const { data: freq } = await supaLookup
        .from("missed_trap_frequency")
        .select("trap, times_missed")
        .eq("type", params.type)
        .order("times_missed", { ascending: false })
        .limit(3);
      weakTraps = (freq ?? []).map((r: { trap: string }) => r.trap);
    } catch {
      /* view may not exist yet on older installs — proceed without nudge */
    }

    // Pick the archetype and the verdict shape HERE rather than letting the
    // model choose. Left to itself it gravitates to earnings-normalisation and
    // to "pass", which is exactly the pattern that made reps predictable.
    // Recent archetypes are excluded so consecutive cases don't rhyme.
    let recent: string[] = [];
    try {
      const { data } = await supaLookup
        .from("cases")
        .select("archetype")
        .not("archetype", "is", null)
        .order("created_at", { ascending: false })
        .limit(6);
      recent = (data ?? []).map((r: { archetype: string }) => r.archetype);
    } catch {
      /* column may not exist yet — fall back to the full pool */
    }

    const pool = ARCHETYPES.filter((a) => !recent.includes(a.key));
    const archetype = (pool.length ? pool : ARCHETYPES)[
      Math.floor(Math.random() * (pool.length ? pool.length : ARCHETYPES.length))
    ];

    // Weighted toward conditional and ambiguous: most real investment
    // decisions are a priced or contingent opinion, not a binary yes/no.
    const verdict: VerdictShape = pickVerdictShape();
    const verdictBrief = VERDICT_SHAPES.find((v) => v.key === verdict)!.brief;

    const { system, user } = buildGenerationMessages(params, weakTraps, {
      archetype,
      verdict,
      verdictBrief,
    });

    // A case with no key insights and no defensible positions cannot be graded
    // — there's nothing to score against and nothing for the review to cite.
    // The model occasionally drops these trailing fields, so verify and retry.
    const insightsOf = (g: GeneratedCase) =>
      ((g as unknown as { key_insights?: unknown[] }).key_insights ?? g.hidden_traps ?? []).length;

    let gen = await jsonCall<GeneratedCase>({
      model: MODELS.generate,
      system,
      user,
      // Archetype-driven cases run longer than the old single-trap shape: more
      // exhibits, footnote detail and defensible positions. 4096 and 8000 both
      // truncated the richer ones, and a truncated generation is a total loss.
      maxTokens: 12000,
    });

    if (insightsOf(gen) === 0) {
      gen = await jsonCall<GeneratedCase>({
        model: MODELS.generate,
        system,
        user:
          user +
          "\n\nYOUR PREVIOUS ATTEMPT OMITTED key_insights AND defensible_positions. Both are mandatory and non-empty. Emit them FIRST, before title and exhibits.",
        maxTokens: 12000,
      });
    }

    // The schema says hidden_traps is a list of strings, but the model
    // occasionally returns objects. Left alone these render as "[object Object]"
    // in the grader prompt and the archive's trap tracker.
    // The model now emits `key_insights` (the old "traps" framing biased every
    // case toward objections); it still lands in the hidden_traps column.
    const rawInsights =
      (gen as unknown as { key_insights?: unknown[] }).key_insights ?? gen.hidden_traps ?? [];
    const traps = rawInsights.map((t: unknown) =>
      typeof t === "string"
        ? t
        : ((t as { trap?: string; text?: string; insight?: string })?.trap ??
           (t as { text?: string })?.text ??
           (t as { insight?: string })?.insight ??
           JSON.stringify(t))
    );

    // Persist to the library so it's re-attemptable and analytics-comparable.
    const supa = serviceClient();
    const base = {
        type: params.type,
        length: params.length,
        has_financials: params.has_financials,
        industry: params.industry,
        difficulty: params.difficulty,
        firm_flavor: params.firm_flavor ?? null,
        title: gen.title,
        prompt: gen.prompt,
        exhibits: gen.exhibits ?? [],
        rubric: gen.rubric,
        hidden_traps: traps,
        suggested_time_sec: gen.suggested_time_sec,
        generation_params: params,
    };
    const withShape = {
      ...base,
      archetype: archetype.key,
      verdict_shape: verdict,
      defensible_positions: gen.defensible_positions ?? [],
    };

    let { data, error } = await supa.from("cases").insert(withShape).select().single();

    // Deploying ahead of migration_006 shouldn't break case generation — fall
    // back to the pre-archetype columns and keep the case.
    if (error && /column .* does not exist|archetype|verdict_shape|defensible_positions/i.test(error.message)) {
      ({ data, error } = await supa.from("cases").insert(base).select().single());
    }

    if (error) throw error;
    return NextResponse.json({ case: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
