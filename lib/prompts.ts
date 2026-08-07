import type { Archetype, GenerateParams, GeneratedCase, GradeResult, VerdictShape } from "./types";
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

export function buildGenerationMessages(
  p: GenerateParams,
  weakTraps: string[] = [],
  shape?: { archetype: Archetype; verdict: VerdictShape; verdictBrief: string }
) {
  const suggested = TIME_BY_LENGTH[p.length];
  const dims = DEFAULT_DIMENSIONS.map((d) => `${d.key} (${d.label}, weight ${d.weight})`).join(", ");

  const system = [
    "You are a senior PE/consulting case-interview author. You write realistic, internally consistent cases and the exact rubric used to grade them.",
    "You write CASE MATERIALS, not case commentary. The materials contain what a deal team would actually have in front of them: figures, management assertions, customer lists, contract terms, market data. They never contain your analysis of those materials.",
    "Return ONLY valid minified JSON, no prose, no markdown fences.",
    "CRITICAL JSON RULE: you will be quoting management and CIM language a lot. Use SINGLE quotes ('like this') for every quotation inside a string value. A raw double quote inside a JSON string breaks the response, and this is the single most common way these generations fail.",
  ].join(" ");

  const user = `Write ONE ${p.difficulty} ${p.type} case.

Parameters:
- Industry: ${p.industry}
- Length: ${p.length} (target reading + thinking time ~${Math.round(suggested / 60)} min)
- Financials/exhibits included: ${p.has_financials}
- Firm flavor: ${p.firm_flavor ?? "none"}${p.firm_flavor ? " (bias the case toward this firm's known style)" : ""}

Type guidance: ${TYPE_GUIDANCE[p.type]}

Difficulty means: ${DIFFICULTY_ANCHORS[p.difficulty]}
${
  shape
    ? `
WHAT THIS CASE TURNS ON (the candidate must never be told this):
${shape.archetype.brief}

Build the decisive evidence for this into the materials as raw data the candidate has to interrogate. Do not make the case turn on anything else. If earnings-quality adjustments are not the point of THIS archetype, then any add-backs or normalisations present must be legitimate and unremarkable — they are texture, not the answer.

HOW IT SHOULD RESOLVE:
${shape.verdictBrief}
`
    : ""
}
CRITICAL — WRITE MATERIALS, NOT ANALYSIS.
The candidate's entire job is to notice what matters. Stating it in the materials destroys the exercise.

Forbidden anywhere in the prompt, exhibit titles, column headers or footnotes:
- Naming the problem: "these add-backs are aggressive", "the business is in a false trough", "margins are concerning", "revenue quality is weak", "this overstates run-rate EBITDA".
- Evaluative adjectives about the company's own figures: unsustainable, inflated, misleading, artificially, questionable, red flag, overstated, understated, deteriorating (as your judgment rather than a stated fact).
- Directing attention: "note that…", "importantly…", "watch the…", "it is worth examining…".
- Rhetorical setup that telegraphs the answer, in either direction.

Required instead — present the same facts neutrally and let them speak:
- BAD: "Management adds back $7mm of 'one-time' costs that recur annually."
  GOOD: "Management-adjusted EBITDA includes a $7mm add-back labelled 'non-recurring restructuring'." Then, elsewhere in an exhibit, show restructuring charges of a similar size in each of the last three years. The candidate connects them.
- BAD: "Customer concentration is dangerously high."
  GOOD: An exhibit listing the top five customers as a percentage of revenue, with contract expiry dates.
- BAD: "Growth has been driven by acquisitions rather than organically."
  GOOD: A revenue bridge line showing acquired versus base revenue by year, with no commentary.

Attribute claims rather than asserting them. "Management projects 12% organic growth" and "the CIM states the contract renews automatically" are facts about what was said — those are fine and realistic. Your own verdict on whether the claim holds is not.

Put the decisive evidence somewhere it must be worked for: split across two exhibits, buried in a footnote alongside unremarkable detail, or present only as an inconsistency between what management says and what a table shows. Include some genuinely unremarkable detail so not every number is load-bearing.

${p.has_financials
      ? "Include 1-3 exhibits as data tables (revenue/EBITDA trajectory, segment mix, unit economics, or comps). Make at least one exhibit necessary to answer well. If the difficulty is hard, embed a quantitative trap in the exhibits (e.g. earnings sitting at a cyclical or stimulus-driven peak)."
      : "Do NOT include financial exhibits; keep it qualitative."}

Build a rubric with these dimensions and weights: ${dims}.
For EACH dimension provide score anchors describing what a 90, a 70, and a 50 look like FOR THIS SPECIFIC CASE (concrete, referencing this case's actual content — not generic).

Also list hidden_traps: the 3-6 specific insights a top candidate must surface, phrased as short imperatives. These are stored for GRADING ONLY and are never shown to the candidate before they answer — so state them plainly here. They must follow from this case's archetype rather than defaulting to earnings normalisation. Where genuinely relevant, these universal principles apply: ${UNIVERSAL_TRAPS.join(" ")}
${weakTraps.length ? `\nSPACED REPETITION: this candidate has recently missed the following in ${p.type} cases — design the case so at least one of these is live again: ${weakTraps.join("; ")}` : ""}
${
  shape?.verdict === "ambiguous"
    ? `\nThis case is deliberately balanced. Also return defensible_positions: the two (or more) verdicts a strong candidate could defend and the grounds for each. The rubric must reward reasoning quality, not the label chosen.`
    : ""
}
Rubric anchors must describe reasoning about THIS business — what a 90 notices that a 70 misses — without restating the answer as a slogan.

LENGTH DISCIPLINE (the response is truncated if it runs long, which wastes the whole generation):
- 2-4 exhibits, at most 8 rows each.
- hidden_traps: 3-6 entries, each ONE sentence of at most 35 words, and each a plain STRING — never an object.
- defensible_positions: at most 2 entries, each with grounds of at most 60 words.
- Rubric anchors: at most 25 words each.
- The case prompt itself: at most 450 words.

Return JSON exactly:
{"title":string,"prompt":string,"exhibits":[{"kind":"table","title":string,"columns":[string],"rows":[[string|number]],"footnote":string?}],"rubric":{"dimensions":[{"key":string,"label":string,"weight":number,"anchors":{"90":string,"70":string,"50":string}}]},"hidden_traps":[string],"defensible_positions":[{"verdict":string,"grounds":string}],"suggested_time_sec":${suggested}}
Return defensible_positions as an empty array unless the case is deliberately balanced.`;

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
  defensiblePositions?: { verdict: string; grounds: string }[];
}) {
  const balanced = (args.defensiblePositions?.length ?? 0) > 0;
  const system = [
    "You are a demanding but fair PE/consulting interviewer grading a candidate's case response.",
    "Grade each rubric dimension INDEPENDENTLY using its score anchors. Be calibrated: most real answers land 55-80. Reserve 85+ for answers that surface what the case was testing and lead with the central question. Do not inflate.",
    balanced
      ? "This case is deliberately balanced and has more than one defensible verdict. Grade the QUALITY OF THE REASONING, not which verdict was chosen. A well-argued minority position that engages the strongest counter-evidence beats a poorly-argued consensus one."
      : "Do not reward a verdict that happens to match while the reasoning behind it is absent — and do not penalise a different verdict that is genuinely well supported by the evidence.",
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

${
  balanced
    ? `DEFENSIBLE POSITIONS on this case (either can score highly if argued well):
${args.defensiblePositions!.map((d) => `- ${d.verdict}: ${d.grounds}`).join("\n")}
`
    : ""
}
For each dimension give an integer 0-100 and 1-3 sentences of specific feedback that quote or reference what the candidate actually said. Then write 2-4 "what this case was really testing" callouts tied to the hidden traps (especially any the candidate missed). Then list missed_traps: the EXACT strings from the hidden traps list above that the candidate did NOT adequately address (empty array if they hit them all).

Finally write takeaways: 3-5 DURABLE, TRANSFERABLE lessons worth writing on paper and carrying into other cases. These are the point of the review — get them right.
- Each must generalise beyond this company. "Check whether cohort-level economics support the aggregate story" is a takeaway; "TechCo's 2023 cohort paid back in 19 months" is not.
- Phrase as a portable rule or habit, not a recap of what happened here.
- Draw them from what this case actually turned on, including anything the candidate handled well — not only their mistakes.
- Give each a short theme for grouping, chosen from: Unit economics, Revenue quality, Cash conversion, Earnings quality, Market and competition, People and governance, External risk, Diligence judgment, Value creation, Valuation, Structuring, Communication.

Return JSON exactly:
{"dimension_scores":{"<key>":int,...},"dimension_feedback":{"<key>":string,...},"tests_callouts":[{"title":string,"body":string}],"missed_traps":[string],"takeaways":[{"theme":string,"text":string}]}`;

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
