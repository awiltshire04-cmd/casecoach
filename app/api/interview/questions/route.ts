import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import type { Question } from "@/lib/interview/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/interview/questions?section=behavioral[&category=][&count=N][&random=1]
// The bank lives behind the service role (see migration_004 — RLS on, no policies).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const section = url.searchParams.get("section") ?? "behavioral";
    const category = url.searchParams.get("category");
    const count = Number(url.searchParams.get("count") ?? 0);
    const random = url.searchParams.get("random") === "1";

    const supa = serviceClient();
    let q = supa
      .from("questions")
      .select("*")  // `*` so a pre-migration-005 database (no `explanation` column) still works
      .eq("section", section)
      .eq("active", true);
    if (category) q = q.eq("category", category);

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

    let questions = (data ?? []) as Question[];
    if (random) {
      // Fisher-Yates so an interview doesn't march through the bank in insert order.
      for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
      }
    } else {
      questions.sort((a, b) => a.category.localeCompare(b.category) || a.prompt.localeCompare(b.prompt));
    }
    if (count > 0) questions = questions.slice(0, count);

    return NextResponse.json({ questions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
