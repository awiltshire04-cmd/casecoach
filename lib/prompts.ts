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

CRITICAL — DO NOT NAME THE ANALYSIS. Banning evaluative words is not enough; a case gives itself away through structure:

1. EXHIBIT TITLES must read like a data room index — what the exhibit CONTAINS, never the analytical move it invites.
   - BAD: "Cohort Unit Economics by Acquisition Year" (tells them to disaggregate cohorts)
   - BAD: "Revenue, Volume and Pricing Bridge" (tells them to split price from volume)
   - BAD: "Customer Concentration Detail" (names the risk)
   - GOOD: "Exhibit 3 — Customer Accounts, FY2021-FY2023", "Schedule 2 — Quarterly Bookings", "Appendix B — Top Accounts by Billings"
   Give the raw material and let them decide what cut to take.

2. DO NOT SUPPLY A RETURNS SKETCH. No "Returns Sketch", no "Illustrative Returns", no scenario table with IRRs. Sketching the return is the candidate's work; handing over the inputs pre-chewed removes the exercise. Give the raw inputs (price, debt terms, EBITDA, growth) in the prompt or an ordinary schedule and stop there.

3. SEPARATE THE FACTS THAT COMBINE. The insight is the connection between two facts, so those two facts must NOT sit in the same sentence, paragraph or exhibit. Put one in the narrative and the other three exhibits later, or in a footnote, or in call notes. If a reader can get the point from one paragraph, you have written the answer down.
   - BAD: "The top five accounts are 44% of revenue and are managed exclusively by the founder, who is leaving. The new VP has no relationships with them."
   - GOOD: the customer list shows five accounts and their share; a separate management bio notes the VP started six months ago; the transaction terms mention the founder's 24-month intention. Three places, one inference.

4. INCLUDE REAL NOISE. At least a third of the rows, line items and details must be genuinely unremarkable — accurate, plausible, and not load-bearing. If every number matters, noticing is trivial.

VARY THE EXHIBIT FORMS. Do not produce four financial tables. Choose 3-5 exhibits from these kinds, and use at least two DIFFERENT kinds:
- "table": columns/rows. Financial schedules, operating stats, customer billings.
- "note": call notes, an internal diligence memo, an email thread — prose with the hedging and digression real notes contain.
- "quote": something a named person actually said, verbatim and unedited.
- "list": customers, contracts, covenants, facilities, key terms — itemised.
- "chart": a series the candidate reads as a shape (e.g. quarterly bookings, headcount, pricing).
- "timeline": dated events, where the sequence carries the meaning.
A management call note or a contract list is often a far better hiding place for the decisive fact than another table.

${p.has_financials
      ? "Include 3-5 exhibits. At least one must be necessary to answer well, and at least one must be a non-table kind (see the exhibit-form rules below)."
      : "Keep it qualitative — no financial schedules. You may still include note, quote, list or timeline exhibits."}

Build a rubric with these dimensions and weights: ${dims}.
For EACH dimension provide score anchors describing what a 90, a 70, and a 50 look like FOR THIS SPECIFIC CASE (concrete, referencing this case's actual content — not generic).

Also list key_insights: the 3-6 things a top candidate must surface. Stored for GRADING ONLY and never shown before answering, so state them plainly. They must follow from this case's archetype rather than defaulting to earnings normalisation.

CRITICAL — key_insights are NOT a list of objections. They are what a sharp reviewer notices, and on a good business most of what they notice is why it works. Match them to how the case resolves:
${
  shape?.verdict === "invest" || shape?.verdict === "conditional"
    ? `- This case does NOT resolve as a flat "no". At least HALF of key_insights must be supporting: the evidence that makes the thesis work, and specifically why the obvious objection does NOT hold here. A candidate who lists concerns without weighing them has not done the work.
- Include at least one insight of the form "the obvious worry is X, but the evidence shows Y" — the reasoning that defeats the reflexive pass.`
    : shape?.verdict === "ambiguous"
      ? `- This case is genuinely balanced. key_insights must include the strongest points on BOTH sides. A candidate is graded on weighing them, never on which side they land.`
      : `- Even though this resolves as a pass, include at least one insight about a genuine strength, so passing requires judgment rather than pattern-matching.`
}

Also return defensible_positions — ALWAYS, for every case, not just balanced ones. Real investment decisions are rarely a binary yes or no, and the candidate is being trained to form a priced, conditional opinion. Give 1-3 positions a strong candidate could defend, each with its grounds. One position means the case has a clear answer; two or more means it is genuinely open. For a conditional case, at least one position must name a price or a condition.

Where genuinely relevant, these universal principles apply: ${UNIVERSAL_TRAPS.join(" ")}
${weakTraps.length ? `\nSPACED REPETITION: this candidate has recently missed the following in ${p.type} cases — design the case so at least one of these is live again: ${weakTraps.join("; ")}` : ""}
Rubric anchors must describe reasoning about THIS business — what a 90 notices that a 70 misses — without restating the answer as a slogan.

LENGTH DISCIPLINE (the response is truncated if it runs long, which wastes the whole generation):
- 3-5 exhibits, at most 8 rows / items / events each; note and quote bodies at most 160 words.
- key_insights: 3-6 entries, each ONE sentence of at most 35 words, and each a plain STRING — never an object.
- anchor_figures: 4-8 entries, derivation at most 20 words.
- defensible_positions: at most 2 entries, each with grounds of at most 60 words.
- Rubric anchors: at most 25 words each.
- The case prompt itself: at most 450 words.

NUMERIC CONSISTENCY — the grading key is used to mark the candidate, so a figure in it that contradicts the exhibits penalises correct work. This is a hard requirement:
- Fix the load-bearing numbers FIRST, in anchor_figures, before writing anything else. Everything downstream must then use exactly those numbers.
- Every figure you cite in key_insights, defensible_positions or the prompt must appear in an exhibit or be exactly computable from one.
- If you state a share ("the top three clients are X% of revenue"), the components AND the denominator must both be in an exhibit, and X must be what they actually produce. Compute it; do not estimate.
- If you state a multiple, the price and the earnings figure must both be present and must actually divide to it.
- Before returning, re-read every number in key_insights and defensible_positions and confirm it reconciles to the exhibits. Correct the exhibit or the claim so they agree — never ship both.

Return JSON exactly, WITH THE KEYS IN THIS ORDER. anchor_figures, key_insights and defensible_positions come first and are MANDATORY and non-empty — a case without them cannot be graded and is worthless. Write them before the exhibits so they are never dropped and so the exhibits are built to match them:
{"anchor_figures":[{"label":string,"value":string,"derivation":string}],"key_insights":[string],"defensible_positions":[{"verdict":string,"grounds":string}],"title":string,"prompt":string,"exhibits":[ExhibitObject],"rubric":{"dimensions":[{"key":string,"label":string,"weight":number,"anchors":{"90":string,"70":string,"50":string}}]},"suggested_time_sec":${suggested}}

anchor_figures: 4-8 load-bearing numbers — entry price, the earnings figure the multiple is struck on, the entry multiple, leverage, any concentration share, the returns outcome. "derivation" states where it comes from and, for anything computed, the arithmetic (e.g. "14.5 of 55.9 revenue = 25.9%"). These are working notes, never shown to the candidate.

Each ExhibitObject is ONE of:
{"kind":"table","title":string,"columns":[string],"rows":[[string|number]],"footnote":string?}
{"kind":"note","title":string,"source":string?,"body":string,"footnote":string?}
{"kind":"quote","title":string,"speaker":string?,"body":string,"footnote":string?}
{"kind":"list","title":string,"items":[{"label":string,"value":(string|number)?,"note":string?}],"footnote":string?}
{"kind":"chart","title":string,"unit":string?,"series":[{"label":string,"points":[{"x":string|number,"y":number}]}],"footnote":string?}
{"kind":"timeline","title":string,"events":[{"when":string,"what":string}],"footnote":string?}`;

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
      ? "This case has more than one defensible position. Grade the QUALITY OF THE REASONING, not which one was chosen. A well-argued minority position that engages the strongest counter-evidence beats a poorly-argued consensus one."
      : "Do not reward a verdict that happens to match while the reasoning behind it is absent — and do not penalise a different verdict that is genuinely well supported by the evidence.",
    "Investment answers are rarely binary. Reward a priced or conditional view — 'yes at this price', 'yes subject to this diligence finding' — over an unqualified yes or no, whenever the evidence supports one.",
    "CRITICAL: raising a concern is not the same as resolving it. A candidate who lists objections without weighing them has NOT done the work and must not out-score one who identifies the same issues, tests them against the evidence, and concludes. Where the evidence defeats an objection, credit the candidate who says so and penalise the one who treats it as disqualifying.",
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

WHAT THE CASE WAS TESTING — the things a top candidate surfaces. Note that these include SUPPORTING evidence, not only objections; credit the candidate for the supporting ones too, and for correctly dismissing a worry the evidence defeats:
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
