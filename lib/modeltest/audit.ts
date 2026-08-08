// Turns the auditor's reading of a workbook into a score.
//
// The split that makes this trustworthy: the model says WHERE each output lives
// and judges HOW the model is built; this file does every numeric comparison
// against the solver's reference. Nothing here trusts the model's arithmetic.

import { jsonCall, MODELS } from "@/lib/anthropic";
import { buildModelAuditMessages } from "./prompts";
import { renderWorkbook, makeCellIndex, citationValid, lookupCell, type CellIndex } from "./workbook-view";
import type { ParsedWorkbook, StaticAnalysis } from "./extract";
import {
  VERDICT_POINTS,
  type CaseStructured,
  type ModelFinding,
  type OutputCheck,
  type ReferenceSolution,
  type Verdict,
} from "./types";

interface RawAudit {
  outputs: { label: string; ref: string | null; value: number | null; note?: string }[];
  mechanics: { area: string; verdict: string; cells?: string[]; note: string }[];
  integrity: { area: string; verdict: string; cells?: string[]; note: string }[];
  summary?: string;
  strengths?: string[];
  fixes?: string[];
}

export interface AuditOutcome {
  outputs: { checks: OutputCheck[]; score: number };
  mechanics: { findings: ModelFinding[]; score: number };
  integrity: { findings: ModelFinding[]; score: number };
  narrative: { summary: string; strengths: string[]; fixes: string[] };
  meta: { mode: "full" | "digest"; cells: number; formulas: number; invalid_citations: number };
}

const asVerdict = (v: string): Verdict =>
  v === "correct" || v === "partial" || v === "incorrect" || v === "missing" ? v : "partial";

/** IRR and MoM are the point of the exercise, so they carry double weight —
 *  same convention the previous checkpoint scoring used. */
const weightOf = (label: string) => (/^(irr|mom|moic)$/i.test(label.trim()) ? 2 : 1);

function scoreFindings(findings: ModelFinding[]): number {
  if (!findings.length) return 0;
  const total = findings.reduce((a, f) => a + (VERDICT_POINTS[f.verdict] ?? 50), 0);
  return Math.round(total / findings.length);
}

function normaliseCitations(
  raw: { area: string; verdict: string; cells?: string[]; note: string }[],
  index: CellIndex
): { findings: ModelFinding[]; invalid: number } {
  let invalid = 0;
  const findings = (raw ?? []).map((f) => {
    const cells = (f.cells ?? []).map((c) => c.replace(/\$/g, "").trim()).filter(Boolean);
    const allValid = cells.length > 0 && cells.every((c) => citationValid(index, c));
    if (cells.length && !allValid) invalid++;
    return {
      area: f.area || "General",
      verdict: asVerdict(f.verdict),
      cells,
      note: f.note ?? "",
      cells_valid: allValid,
    };
  });
  return { findings, invalid };
}

export async function auditWorkbook(args: {
  pw: ParsedWorkbook;
  sa: StaticAnalysis;
  c: CaseStructured;
  sol: ReferenceSolution;
  concepts: string[];
  conventions: string[];
}): Promise<AuditOutcome> {
  const view = renderWorkbook(args.pw);
  const index = makeCellIndex(args.pw);

  const msgs = buildModelAuditMessages({
    c: args.c,
    sol: args.sol,
    concepts: args.concepts,
    conventions: args.conventions,
    workbook: view.text,
    workbookMode: view.mode,
    staticNotes: args.sa.notes,
    hardcodeRatio: args.sa.hardcode_ratio,
    iterativeCalc: args.sa.iterative_calc_enabled,
  });

  const raw = await jsonCall<RawAudit>({
    model: MODELS.grade,
    system: msgs.system,
    user: msgs.user,
    maxTokens: 8000,
  });

  // ---- outputs: the model located them, we do the comparison ----
  const located = new Map<string, { ref: string | null; value: number | null; note?: string }>();
  for (const o of raw.outputs ?? []) {
    if (o?.label) located.set(o.label.toLowerCase().trim(), o);
  }

  let invalidCitations = 0;
  const checks: OutputCheck[] = args.sol.checkpoints.map((cp) => {
    const hit = located.get(cp.label.toLowerCase().trim());
    const expected = cp.kind === "pct" ? cp.value * 100 : cp.value;

    let found = typeof hit?.value === "number" ? hit.value : null;
    let ref = hit?.ref ?? null;
    let refValid = false;

    if (ref) {
      refValid = citationValid(index, ref);
      if (!refValid) invalidCitations++;
      // Prefer the workbook's own value over the model's transcription of it.
      const actual = lookupCell(args.pw, ref);
      if (actual != null) {
        found = cp.kind === "pct" && Math.abs(actual) <= 1 ? actual * 100 : actual;
      }
    }
    if (found != null && cp.kind === "pct" && Math.abs(found) <= 1) found = found * 100;

    // A location with no value is a label, not an output. Showing "B4 / not
    // found" reads as a contradiction; the note carries the useful detail.
    if (found == null) ref = null;

    const pass = found != null && Math.abs(found - expected) <= cp.tol;
    return {
      label: cp.label,
      expected: Math.round(expected * 100) / 100,
      found: found != null ? Math.round(found * 100) / 100 : null,
      pass,
      kind: cp.kind,
      ref,
      ref_valid: ref ? refValid : undefined,
      note: hit?.note,
    };
  });

  const wTotal = checks.reduce((a, c) => a + weightOf(c.label), 0);
  const wPass = checks.reduce((a, c) => a + (c.pass ? weightOf(c.label) : 0), 0);
  const outputsScore = Math.round((wPass / Math.max(1, wTotal)) * 100);

  const mech = normaliseCitations(raw.mechanics ?? [], index);
  const integ = normaliseCitations(raw.integrity ?? [], index);

  return {
    outputs: { checks, score: outputsScore },
    mechanics: { findings: mech.findings, score: scoreFindings(mech.findings) },
    integrity: { findings: integ.findings, score: scoreFindings(integ.findings) },
    narrative: {
      summary: raw.summary ?? "",
      strengths: raw.strengths ?? [],
      fixes: raw.fixes ?? [],
    },
    meta: {
      mode: view.mode,
      cells: view.stats.cells,
      formulas: view.stats.formulas,
      invalid_citations: invalidCitations + mech.invalid + integ.invalid,
    },
  };
}
