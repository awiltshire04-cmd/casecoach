import { NextResponse } from "next/server";
import { jsonCall, MODELS } from "@/lib/anthropic";
import { serviceClient } from "@/lib/supabase";
import { parseWorkbook, extractCheckpoints, staticAnalysis, formulaSample } from "@/lib/modeltest/extract";
import { buildFormulaReviewMessages, buildWriteupMessages } from "@/lib/modeltest/prompts";
import {
  TEST_TIME_BENCH, WRITEUP_DIMENSIONS,
  type CaseStructured, type GenerateTestParams, type GradeBreakdown, type ReferenceSolution, type TestDifficulty,
} from "@/lib/modeltest/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const supa = serviceClient();
    const contentType = req.headers.get("content-type") ?? "";

    // ---- action: open (JSON) — creates the attempt row; the timer anchors server-side ----
    if (contentType.includes("application/json")) {
      const { action, testId } = (await req.json()) as { action: string; testId: string };
      if (action !== "open") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
      const { data, error } = await supa
        .from("model_test_attempts")
        .insert({ test_id: testId })
        .select("id, opened_at")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ attemptId: data.id, opened_at: data.opened_at });
    }

    // ---- action: submit (multipart) ----
    const form = await req.formData();
    const attemptId = String(form.get("attemptId") ?? "");
    const testId = String(form.get("testId") ?? "");
    const writeup = String(form.get("writeup") ?? "");
    const file = form.get("file");
    if (!attemptId || !testId || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing attemptId, testId, or file." }, { status: 400 });
    }
    if (!/\.xlsx$/i.test(file.name)) {
      return NextResponse.json({ error: "Please upload a .xlsx workbook." }, { status: 400 });
    }

    const { data: test, error: tErr } = await supa
      .from("model_tests")
      .select("params, case_structured, reference_solution")
      .eq("id", testId)
      .single();
    if (tErr || !test) return NextResponse.json({ error: "Test not found." }, { status: 404 });
    const { data: att, error: aErr } = await supa
      .from("model_test_attempts")
      .select("opened_at")
      .eq("id", attemptId)
      .single();
    if (aErr || !att) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });

    const structured = test.case_structured as CaseStructured;
    const solution = test.reference_solution as ReferenceSolution;
    const params = test.params as GenerateTestParams;
    const timeTakenSec = Math.max(0, Math.round((Date.now() - new Date(att.opened_at).getTime()) / 1000));

    // Store the workbook, then parse it.
    const buf = Buffer.from(await file.arrayBuffer());
    const path = `${attemptId}.xlsx`;
    const up = await supa.storage.from("model-submissions").upload(path, buf, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: true,
    });
    const filePath = up.error ? null : path; // storage failure shouldn't block grading

    let pw;
    try {
      pw = parseWorkbook(buf);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Could not parse workbook: ${msg}` }, { status: 400 });
    }

    // A: outputs vs reference key
    const checks = extractCheckpoints(pw, solution);
    const weightOf = (label: string) => (label === "IRR" || label === "MoM" ? 2 : 1);
    const wTotal = checks.reduce((a, c) => a + weightOf(c.label), 0);
    const wPass = checks.reduce((a, c) => a + (c.pass ? weightOf(c.label) : 0), 0);
    const outputsScore = Math.round((wPass / Math.max(1, wTotal)) * 100);

    // B: static structure analysis
    const sa = staticAnalysis(pw);
    let structureScore = 100;
    if (!sa.irr_is_formula) structureScore -= 25;
    else if (!sa.irr_inputs_are_formulas) structureScore -= 15;
    structureScore -= Math.min(20, sa.error_cells.length * 5);
    if (sa.hardcode_ratio > 0.35) structureScore -= Math.min(20, Math.round((sa.hardcode_ratio - 0.35) * 100));
    if (!sa.balance_check_found) structureScore -= 10;
    if (structured.entry.interest_basis === "average" && sa.iterative_calc_enabled === false) {
      structureScore -= 10;
      sa.notes.push("Case requires average-balance interest but iterative calculation is off — circularity likely broken or averaged away.");
    }
    structureScore = Math.max(0, structureScore);

    // Concept mechanics review (LLM over formula sample)
    const sample = formulaSample(pw, params.concepts);
    let conceptResults: GradeBreakdown["concepts"] = [];
    try {
      const fr = buildFormulaReviewMessages({
        concepts: params.concepts,
        formulasSample: sample,
        checkpoints: solution.checkpoints.map((c) => ({ label: c.label, value: c.value })),
      });
      const res = await jsonCall<{ concepts: GradeBreakdown["concepts"] }>({
        model: MODELS.grade, system: fr.system, user: fr.user, maxTokens: 2048,
      });
      conceptResults = res.concepts ?? [];
    } catch {
      conceptResults = params.concepts.map((k) => ({ key: k, verdict: "partial" as const, note: "Automated review unavailable — scored neutrally." }));
    }
    const verdictPts: Record<string, number> = { correct: 100, partial: 60, incorrect: 20, not_found: 0 };
    const conceptScore = Math.round(
      conceptResults.reduce((a, c) => a + (verdictPts[c.verdict] ?? 50), 0) / Math.max(1, conceptResults.length)
    );

    // Write-up grade (reweighted rubric, sensitivity-aware)
    let writeupScore = 0;
    let writeupDims: Record<string, number> = {};
    let writeupFb: Record<string, string> = {};
    if (writeup.trim().length > 0) {
      try {
        const wu = buildWriteupMessages({ writeup, sol: solution, concepts: params.concepts });
        const res = await jsonCall<{ dimension_scores: Record<string, number>; feedback: Record<string, string> }>({
          model: MODELS.grade, system: wu.system, user: wu.user, maxTokens: 2048,
        });
        writeupDims = res.dimension_scores ?? {};
        writeupFb = res.feedback ?? {};
        const totW = WRITEUP_DIMENSIONS.reduce((a, d) => a + d.weight, 0);
        writeupScore = Math.round(
          WRITEUP_DIMENSIONS.reduce((a, d) => a + (writeupDims[d.key] ?? 0) * d.weight, 0) / totW
        );
      } catch {
        writeupFb = { numerical: "Write-up grading failed — try resubmitting.", judgment: "", comms: "" };
      }
    } else {
      writeupFb = { numerical: "No write-up submitted.", judgment: "", comms: "" };
    }

    const bench = TEST_TIME_BENCH[(params.difficulty ?? "level4") as TestDifficulty];
    const speedContext =
      timeTakenSec <= bench * 0.75
        ? "Comfortably inside the benchmark — strong pace."
        : timeTakenSec <= bench
          ? "Inside the benchmark."
          : `Over the ${Math.round(bench / 60)}-minute benchmark — in a live test this costs polish time on the memo.`;

    const total = Math.round(0.45 * outputsScore + 0.2 * structureScore + 0.2 * conceptScore + 0.15 * writeupScore);

    const grade: GradeBreakdown = {
      outputs: { checks, score: outputsScore },
      structure: { ...sa, score: structureScore },
      concepts: conceptResults,
      writeup: { dimension_scores: writeupDims, feedback: writeupFb, score: writeupScore },
      speed: { time_taken_sec: timeTakenSec, benchmark_sec: bench, context: speedContext },
      total,
    };

    const { error: upErr } = await supa
      .from("model_test_attempts")
      .update({
        submitted_at: new Date().toISOString(),
        time_taken_sec: timeTakenSec,
        file_path: filePath,
        writeup,
        outputs_extracted: checks,
        grade,
        status: "graded",
      })
      .eq("id", attemptId);
    if (upErr) return NextResponse.json({ error: `Graded but failed to save: ${upErr.message}`, grade }, { status: 500 });

    return NextResponse.json({ grade });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
