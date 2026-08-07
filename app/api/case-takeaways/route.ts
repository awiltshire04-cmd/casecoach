import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import type { Takeaway } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/case-takeaways — every takeaway harvested from completed cases,
// newest first, with its source case attached. Grouping by theme happens
// client-side so the view can be re-sliced without another round trip.
export async function GET() {
  try {
    const supa = serviceClient();
    const { data, error } = await supa
      .from("case_takeaways")
      .select("id, created_at, case_id, attempt_id, theme, text, cases(title, type)")
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === "PGRST205" || /could not find the table/i.test(error.message)) {
        return NextResponse.json(
          {
            error: "The takeaways table doesn't exist yet. Run supabase/migration_006_case_variety.sql.",
            setup: true,
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type Raw = {
      id: string; created_at: string; case_id: string; attempt_id: string | null;
      theme: string; text: string; cases: { title: string; type: string } | null;
    };

    const takeaways: Takeaway[] = ((data ?? []) as unknown as Raw[]).map((r) => ({
      id: r.id,
      created_at: r.created_at,
      case_id: r.case_id,
      attempt_id: r.attempt_id,
      theme: r.theme,
      text: r.text,
      case_title: r.cases?.title ?? "Case",
      case_type: r.cases?.type ?? "",
    }));

    return NextResponse.json({ takeaways });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
