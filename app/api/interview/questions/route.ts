import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import type { Question } from "@/lib/interview/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Listing all 614 technical questions with their guidance and explanation text
// is ~800KB per page load, and the single-question screen needs exactly one row.
// So the list stays lean and the heavy fields are fetched one question at a time.
const LIST_FIELDS = "id, section, category, prompt, difficulty, source, source_ref, concept_tags";
const FULL_FIELDS = `${LIST_FIELDS}, guidance, explanation`;

function setupError(error: { message: string; code?: string }) {
  if (error.code === "PGRST205" || /could not find the table/i.test(error.message)) {
    return NextResponse.json(
      { error: "The question bank table doesn't exist yet. Run supabase/migration_004_interview_bank.sql.", setup: true },
      { status: 503 }
    );
  }
  if (/explanation/i.test(error.message) && /does not exist/i.test(error.message)) {
    return NextResponse.json(
      { error: "The `explanation` column is missing. Run supabase/migration_005_technical.sql.", setup: true },
      { status: 503 }
    );
  }
  return null;
}

// GET /api/interview/questions?id=<uuid>             → one question, all fields
// GET /api/interview/questions?section=behavioral…   → lean list for the bank
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const supa = serviceClient();

    if (id) {
      const { data, error } = await supa.from("questions").select(FULL_FIELDS).eq("id", id).single();
      if (error) return setupError(error) ?? NextResponse.json({ error: "Question not found." }, { status: 404 });
      return NextResponse.json({ question: data as unknown as Question });
    }

    const section = url.searchParams.get("section") ?? "behavioral";
    const category = url.searchParams.get("category");
    const count = Number(url.searchParams.get("count") ?? 0);
    const random = url.searchParams.get("random") === "1";

    let q = supa.from("questions").select(LIST_FIELDS).eq("section", section).eq("active", true);
    if (category) q = q.eq("category", category);

    const { data, error } = await q;
    if (error) return setupError(error) ?? NextResponse.json({ error: error.message }, { status: 500 });

    let questions = (data ?? []) as unknown as Question[];
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
