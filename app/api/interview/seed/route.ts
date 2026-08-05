import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import seed from "@/lib/interview/technical-seed.json";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface SeedRow {
  category: string;
  prompt: string;
  difficulty: string;
  source: string;
  source_ref: string;
  concept_tags: string[];
  guidance: string;
  explanation: string;
}

// POST /api/interview/seed — idempotent load of the technical bank.
// The bank is data, not code, so it ships as JSON and is inserted rather than
// hand-written into a migration: 600+ INSERT statements is not a reviewable file.
// `questions` is unique on (section, prompt), so re-running is a no-op.
export async function POST() {
  try {
    const supa = serviceClient();
    const rows = seed as SeedRow[];

    const { count: before } = await supa
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("section", "technical");

    // Chunked so a single oversized request body can't fail the whole load.
    let inserted = 0;
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK).map((r) => ({ ...r, section: "technical", active: true }));
      const { error } = await supa.from("questions").upsert(chunk, { onConflict: "section,prompt", ignoreDuplicates: true });
      if (error) {
        if (/explanation/.test(error.message)) {
          return NextResponse.json(
            { error: "The `explanation` column is missing. Run supabase/migration_005_technical.sql first.", setup: true },
            { status: 503 }
          );
        }
        return NextResponse.json({ error: `Chunk ${i / CHUNK + 1}: ${error.message}` }, { status: 500 });
      }
      inserted += chunk.length;
    }

    const { count: after } = await supa
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("section", "technical");

    return NextResponse.json({
      submitted: inserted,
      before: before ?? 0,
      after: after ?? 0,
      added: (after ?? 0) - (before ?? 0),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
