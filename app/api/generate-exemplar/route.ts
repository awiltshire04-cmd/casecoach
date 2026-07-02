import { NextResponse } from "next/server";
import { jsonCall, MODELS } from "@/lib/anthropic";
import { serviceClient, exhibitsToText } from "@/lib/supabase";
import { buildExemplarMessages } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { caseId, candidateResponse } = (await req.json()) as {
      caseId: string;
      candidateResponse?: string;
    };
    const supa = serviceClient();

    const { data: c, error } = await supa.from("cases").select("*").eq("id", caseId).single();
    if (error || !c) throw error ?? new Error("Case not found");

    // Return cached exemplar + gaps if present (generic gaps only; the
    // candidate-specific diff is regenerated when a response is passed).
    if (c.exemplar && c.exemplar_gaps && !candidateResponse) {
      return NextResponse.json({ exemplar: c.exemplar, gaps: c.exemplar_gaps });
    }

    const { system, user } = buildExemplarMessages({
      prompt: c.prompt,
      exhibitsText: exhibitsToText(c.exhibits ?? []),
      hiddenTraps: c.hidden_traps ?? [],
      candidateResponse,
    });

    const out = await jsonCall<{ exemplar: string; gaps: string[] }>({
      model: MODELS.exemplar,
      system,
      user,
      maxTokens: 2000,
    });

    // Cache exemplar text always; cache generic gaps only when not candidate-specific.
    const update: Record<string, unknown> = { exemplar: out.exemplar };
    if (!candidateResponse) update.exemplar_gaps = out.gaps;
    await supa.from("cases").update(update).eq("id", caseId);

    return NextResponse.json({ exemplar: out.exemplar, gaps: out.gaps });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Exemplar generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
