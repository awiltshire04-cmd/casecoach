import { NextResponse } from "next/server";
import { jsonCall, MODELS } from "@/lib/anthropic";
import { serviceClient } from "@/lib/supabase";
import { buildGenerationMessages } from "@/lib/prompts";
import type { GenerateParams, GeneratedCase } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const { system, user } = buildGenerationMessages(params, weakTraps);

    const gen = await jsonCall<GeneratedCase>({
      model: MODELS.generate,
      system,
      user,
      maxTokens: 4096,
    });

    // Persist to the library so it's re-attemptable and analytics-comparable.
    const supa = serviceClient();
    const { data, error } = await supa
      .from("cases")
      .insert({
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
        hidden_traps: gen.hidden_traps ?? [],
        suggested_time_sec: gen.suggested_time_sec,
        generation_params: params,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ case: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
