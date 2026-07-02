import { NextResponse } from "next/server";
import { jsonCall, MODELS } from "@/lib/anthropic";
import { serviceClient } from "@/lib/supabase";
import { buildTrendMessages } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Insight {
  kind: "weakness" | "strength";
  title: string;
  body: string;
}

export async function POST() {
  try {
    const supa = serviceClient();
    const { data, error } = await supa
      .from("attempt_history")
      .select("type, difficulty, ai_score, dimension_scores")
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw error;

    if (!data || data.length < 3) {
      return NextResponse.json({ insights: [], note: "Log at least 3 attempts for trend insights." });
    }

    const { system, user } = buildTrendMessages(data as never);
    const result = await jsonCall<{ insights: Insight[] }>({
      model: MODELS.trends,
      system,
      user,
      maxTokens: 1200,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trend analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
