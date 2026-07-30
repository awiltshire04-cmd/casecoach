import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";

export const runtime = "nodejs";

// GET /api/modeltest-file?attemptId=... → 302 to a short-lived signed URL for the
// submitted workbook in the private model-submissions bucket.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const attemptId = url.searchParams.get("attemptId");
    if (!attemptId) return NextResponse.json({ error: "Missing attemptId." }, { status: 400 });

    const supa = serviceClient();
    const { data: att, error } = await supa
      .from("model_test_attempts")
      .select("file_path")
      .eq("id", attemptId)
      .single();
    if (error || !att?.file_path) {
      return NextResponse.json({ error: "No workbook stored for this attempt." }, { status: 404 });
    }
    const { data: signed, error: sErr } = await supa.storage
      .from("model-submissions")
      .createSignedUrl(att.file_path, 120, { download: `model_${attemptId}.xlsx` });
    if (sErr || !signed?.signedUrl) {
      return NextResponse.json({ error: sErr?.message ?? "Could not sign URL." }, { status: 500 });
    }
    return NextResponse.redirect(signed.signedUrl, 302);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
