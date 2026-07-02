import type { GenerateParams, GeneratedCase, GradeResult } from "./types";
import { DEFAULT_DIMENSIONS, TIME_BY_LENGTH } from "./types";

// ===========================================================================
// GENERATION
// ===========================================================================
// Difficulty is calibrated with concrete anchors, not adjectives. The rubric
// (with per-band score anchors) and hidden traps are emitted alongside the
// prompt so the grader later scores against fixed criteria.

const DIFFICULTY_ANCHORS: Record<string, string> = {
  easy:
    "One central tension. Financials (if any) are clean and need no normalization. Seller framing is honest. A strong candidate reaches a defensible verdict in one pass.",
  medium:
    "Two interacting tensions. At least one quantitative element requires a simple adjustment (e.g. margin trajectory, basic returns sketch). Some seller framing is optimistic and should be questioned.",
  hard:
    "Three or more interacting tensions. At least one quantitative TRAP that requires normalization before any multiple is quoted (peak/stimulus-distorted earnings, pro-forma add-backs, cyclical peak). Seller framing is actively misleading. The correct answer requires the candidate to lead with the single question that drives the return, not to list evenly.",
};

const TYPE_GUIDANCE: Record<string, string> = {
  lbo:
    "A 'would you invest' buyout case. Reward: leading with a priced verdict, identifying the ONE central question, a back-of-envelope returns/normalization sketch, and pricing risk rather than betting on macro. Bake in a realistic entry multiple, leverage, and hold.",
  market_entry:
    "Should company X enter market Y. Reward: market sizing, competitive dynamics, entry-mode analysis, and a clear go/no-go with conditions. Quant is lighter than an LBO — weight structure and judgment higher.",
  profitability:
    "Profits have declined; diagnose why. Reward: clean revenue-vs-cost decomposition, isolating the driver, and a prioritized fix. Reward disaggregation over generic frameworks.",
  growth:
    "How should company X grow. Reward: organic-vs-inorganic levers, sequencing by value-to-effort, and honest constraints. Penalize reaching for M&A when organic levers are stronger.",
  m_and_a:
    "Should acquirer A buy target B. Reward: strategic rationale, synergy realism (revenue vs. cost), integration risk, and a priced verdict. Penalize hand-waved synergies.",
};

// Cross-cutting lessons the grader should always reward, drawn from strong PE practice.
const UNIVERSAL_TRAPS = [
  "Normalize peak / stimulus-distorted / pro-forma EBITDA before quoting any multiple.",
  "For roll-ups: ask whether the M&A flywheel still spins; the spread that matters is exit-multiple minus acquisition-multiple, and never underwrite multiple expansion at exit.",
  "Disaggregate multi-asset / multi-segment businesses instead of treating them as one blob.",
  "Distinguish company-specific risk (alpha) from category-wide risk (usually priced in).",
  "Price uncertainty rather than betting on a macro call.",
  "Interrogate every metric that is off-benchmark as either a cost or an opportunity.",
];

export function buildGenerationMessages(p: GenerateParams, weakTraps: string[] = []) {
  const suggested = TIME_BY_LENGTH[p.length];
  const dims = DEFAULT_DIMENSIONS.map((d) => `${d.key} (${d.label}, weight ${d.weight})`).join(", ");

  const system = [
    "You are a senior PE/consulting case-interview author. You write realistic, internally consistent cases and the exact rubric used to grade them.",
    "Return ONLY valid minified JSON, no prose, no markdown fences.",
  ].join(" ");

  const user = `Write ONE ${p.difficulty} ${p.type} case.

Parameters:
- Industry: ${p.industry}
- Length: ${p.length} (target reading + thinking time ~${Math.round(suggested / 60)} min)
- Financials/exhibits included: ${p.has_financials}
- Firm flavor: ${p.firm_flavor ?? "none"}${p.firm_flavor ? " (bias the case toward this firm's known style)" : ""}

Type guidance: ${TYPE_GUIDANCE[p.type]}

Difficulty means: ${DIFFICULTY_ANCHORS[p.difficulty]}

${p.has_financials
      ? "Include 1-3 exhibits as data tables (revenue/EBITDA trajectory, segment mix, unit economics, or comps). Make at least one exhibit necessary to answer well. If the difficulty is hard, embed a quantitative trap in the exhibits (e.g. earnings sitting at a cyclical or stimulus-driven peak)."
      : "Do NOT include financial exhibits; keep it qualitative."}

Build a rubric with these dimensions and weights: ${dims}.
For EACH dimension provide score anchors describing what a 90, a 70, and a 50 look like FOR THIS SPECIFIC CASE (concrete, referencing this case's actual content — not generic).

Also list hidden_traps: the 3-6 specific insights/traps a top candidate must hit, phrased as short imperatives. Where relevant, draw on these universal principles: ${UNIVERSAL_TRAPS.join(" ")}
${weakTraps.length ? `\nSPACED REPETITION: this candidate has recently missed the following in ${p.type} cases — design the case so at least one of these is a live trap again: ${weakTraps.join("; ")}` : ""}

Return JSON exactly:
{"title":string,"prompt":string,"exhibits":[{"kind":"table","title":string,"columns":[string],"rows":[[string|number]],"footnote":string?}],"rubric":{"dimensions":[{"key":string,"label":string,"weight":number,"anchors":{"90":string,"70":string,"50":string}}]},"hidden_traps":[string],"suggested_time_sec":${suggested}}`;

  return { system, user };
}

// ===========================================================================
// GRADING
// ===========================================================================
// Grader receives the case, the SAME rubric with anchors, and the hidden traps.
// It grades each dimension independently before the weighted total is computed
// in code (not by the model) to avoid arithmetic drift.

export function buildGradingMessages(args: {
  caseType: string;
  prompt: string;
  exhibitsText: string;
  rubric: GeneratedCase["rubric"];
  hiddenTraps: string[];
  response: string;
}) {
  const system = [
    "You are a demanding but fair PE/consulting interviewer grading a candidate's case response.",
    "Grade each rubric dimension INDEPENDENTLY using its score anchors. Be calibrated: most real answers land 55-80. Reserve 85+ for answers that hit the hidden traps and lead with the central question. Do not inflate.",
    "Return ONLY valid minified JSON, no prose, no markdown fences.",
  ].join(" ");

  const rubricText = args.rubric.dimensions
    .map(
      (d) =>
        `- ${d.key} (${d.label}, weight ${d.weight}): 90="${d.anchors["90"]}" 70="${d.anchors["70"]}" 50="${d.anchors["50"]}"`
    )
    .join("\n");

  const user = `CASE TYPE: ${args.caseType}

CASE PROMPT:
${args.prompt}

${args.exhibitsText ? `EXHIBITS:\n${args.exhibitsText}\n` : ""}
RUBRIC (grade each dimension against these anchors):
${rubricText}

HIDDEN TRAPS the case was really testing (reward hitting these, note the ones missed):
${args.hiddenTraps.map((t, i) => `${i + 1}. ${t}`).join("\n")}

CANDIDATE RESPONSE:
"""
${args.response}
"""

For each dimension give an integer 0-100 and 1-3 sentences of specific feedback that quote or reference what the candidate actually said. Then write 2-4 "what this case was really testing" callouts tied to the hidden traps (especially any the candidate missed). Finally, list missed_traps: the EXACT strings from the hidden traps list above that the candidate did NOT adequately address (empty array if they hit them all).

Return JSON exactly:
{"dimension_scores":{"<key>":int,...},"dimension_feedback":{"<key>":string,...},"tests_callouts":[{"title":string,"body":string}],"missed_traps":[string]}`;

  return { system, user };
}

// Weighted total computed in code so arithmetic is deterministic.
export function computeTotal(
  dimensionScores: Record<string, number>,
  rubric: GeneratedCase["rubric"]
): number {
  let sum = 0;
  let weight = 0;
  for (const d of rubric.dimensions) {
    const s = dimensionScores[d.key];
    if (typeof s === "number") {
      sum += s * d.weight;
      weight += d.weight;
    }
  }
  return weight ? Math.round(sum / weight) : 0;
}

export function buildExemplarMessages(args: {
  prompt: string;
  exhibitsText: string;
  hiddenTraps: string[];
  candidateResponse?: string;
}) {
  const system =
    "You are a top candidate demonstrating an A+ case response, then a coach identifying gaps. Return ONLY valid minified JSON, no fences.";
  const user = `CASE:\n${args.prompt}\n${args.exhibitsText ? `\nEXHIBITS:\n${args.exhibitsText}\n` : ""}
Write an ideal answer: lead with a priced verdict, name the single central question, structure tightly, show back-of-envelope math where relevant, close with what would change your mind. Concise, spoken-length, plain prose (no headers). Hit these points naturally: ${args.hiddenTraps.join("; ")}.
${args.candidateResponse ? `\nThen compare to the CANDIDATE'S ACTUAL ANSWER below and list 3-5 specific things the exemplar did that the candidate's answer did not.\n\nCANDIDATE ANSWER:\n"""\n${args.candidateResponse}\n"""` : "\nAlso list 3-5 things a strong answer must include that weaker answers typically miss."}

Return JSON exactly: {"exemplar":string,"gaps":[string]}`;
  return { system, user };
}

export function buildTrendMessages(rows: {
  type: string;
  difficulty: string;
  ai_score: number;
  dimension_scores: Record<string, number> | null;
}[]) {
  const system =
    "You are a case-prep coach. Given a candidate's attempt history, identify 2-4 concrete recurring weaknesses and 1-2 strengths. Be specific and actionable. Return ONLY valid minified JSON, no fences.";
  const user = `Attempt history (JSON): ${JSON.stringify(rows)}

Return JSON exactly: {"insights":[{"kind":"weakness"|"strength","title":string,"body":string}]}`;
  return { system, user };
}
