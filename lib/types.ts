// Shared contract. Generation emits the case + rubric + traps together;
// grading consumes that same rubric so scores are fair across re-attempts.

export type CaseType =
  | "lbo"
  | "market_entry"
  | "profitability"
  | "growth"
  | "m_and_a";

export type Length = "short" | "medium" | "long";
export type Difficulty = "easy" | "medium" | "hard";

export const CASE_TYPES: { value: CaseType; label: string }[] = [
  { value: "lbo", label: "LBO / Investment" },
  { value: "market_entry", label: "Market Entry" },
  { value: "profitability", label: "Profitability" },
  { value: "growth", label: "Growth Strategy" },
  { value: "m_and_a", label: "M&A" },
];

export const INDUSTRIES = [
  "Consumer & Retail",
  "Industrials",
  "Healthcare Services",
  "Software & Tech",
  "Business Services",
  "Financial Services",
  "Restaurants & Hospitality",
  "Education",
] as const;

export const FIRM_FLAVORS: { value: string; label: string; note: string }[] = [
  { value: "advent", label: "Advent International", note: "Operational rigor, value-creation depth" },
  { value: "bain", label: "Bain Capital", note: "Framework-forward, structured MECE" },
  { value: "general_atlantic", label: "General Atlantic", note: "Growth equity lens, durability of growth" },
  { value: "eqt", label: "EQT", note: "Thematic, secular-tailwind sector bets" },
  { value: "francisco", label: "Francisco Partners", note: "Software / carve-out orientation" },
  { value: "cdr", label: "CD&R", note: "Operating-partner led, industrial / services" },
  { value: "permira", label: "Permira", note: "Growth + tech, consumer brands" },
  { value: "tsg", label: "TSG Consumer", note: "Branded consumer, DTC velocity" },
  { value: "lcatterton", label: "L Catterton", note: "Consumer/retail, brand equity focus" },
  { value: "kkr", label: "KKR", note: "Large-cap, balance-sheet creativity" },
  { value: "blackstone", label: "Blackstone", note: "Scale, thematic mega-deals" },
  { value: "apollo", label: "Apollo", note: "Value / distressed, credit-inflected" },
  { value: "warburg", label: "Warburg Pincus", note: "Growth-oriented, sector depth" },
  { value: "tpg", label: "TPG", note: "Thematic, tech + healthcare + impact" },
  { value: "thoma", label: "Thoma Bravo", note: "Software buyouts, margin expansion" },
  { value: "vista", label: "Vista Equity", note: "Enterprise software, playbook-driven" },
  { value: "hf", label: "Hellman & Friedman", note: "High-quality compounders, low churn" },
  { value: "berkshire", label: "Berkshire Partners", note: "Mid-cap growth, operational partnership" },
];

// Suggested time budgets in seconds, by length.
export const TIME_BY_LENGTH: Record<Length, number> = {
  short: 5 * 60,
  medium: 12 * 60,
  long: 25 * 60,
};

// ---------------------------------------------------------------------------
// Archetypes — what the case actually turns on.
//
// Case *type* is the question being asked (should we buy this, should they
// enter that market). Archetype is the orthogonal axis: which lever decides the
// answer. Without it, generation collapses onto "spot the EBITDA adjustment",
// which is a pattern to memorise rather than a business to think about.
//
// The archetype is chosen server-side and never shown to the candidate.
// ---------------------------------------------------------------------------

export interface Archetype {
  key: string;
  label: string;
  /** Theme used to group review-sheet takeaways. */
  theme: string;
  /** What the generator must build the case around. */
  brief: string;
}

export const ARCHETYPES: Archetype[] = [
  {
    key: "cohort_economics",
    label: "Cohort economics",
    theme: "Unit economics",
    brief:
      "Blended unit economics look healthy, but the picture breaks apart by cohort, vintage or segment — later cohorts pay back more slowly, or one strong early cohort is carrying the average. Aggregate metrics are honest; they are simply the wrong cut.",
  },
  {
    key: "customer_concentration",
    label: "Customer concentration",
    theme: "Revenue quality",
    brief:
      "The P&L is fine. The risk is who the revenue comes from — a handful of customers, a renewal cliff, a contract that can be terminated for convenience, or a distributor who owns the end relationship.",
  },
  {
    key: "churn_retention",
    label: "Churn and retention",
    theme: "Revenue quality",
    brief:
      "Growth is real but gross retention is weak and masked by new-logo acquisition or expansion within a shrinking base. The question is whether the business keeps what it wins.",
  },
  {
    key: "working_capital",
    label: "Working capital trap",
    theme: "Cash conversion",
    brief:
      "Earnings look attractive but cash conversion is poor or deteriorating — inventory build, receivable stretch, supplier terms that are about to normalise, or growth that consumes cash faster than it generates it.",
  },
  {
    key: "capital_intensity",
    label: "Capital intensity",
    theme: "Cash conversion",
    brief:
      "Reported EBITDA overstates economics because maintenance capex, deferred maintenance or a replacement cycle is understated. Free cash flow, not EBITDA, is the operative number.",
  },
  {
    key: "market_structure",
    label: "Market structure",
    theme: "Market and competition",
    brief:
      "A well-run business in a market that is deteriorating, consolidating against it, or about to be disrupted. Company-level metrics look good precisely because the market damage has not arrived yet.",
  },
  {
    key: "competitive_displacement",
    label: "Competitive displacement",
    theme: "Market and competition",
    brief:
      "A credible competitor, channel shift or substitute is taking share in a way the historicals do not yet show. Win rates, pricing or pipeline mix tell the story before revenue does.",
  },
  {
    key: "pricing_power",
    label: "Pricing power",
    theme: "Market and competition",
    brief:
      "Recent growth came from price rather than volume, and the question is whether that price sticks — or conversely, whether an underpriced business has untapped room to raise.",
  },
  {
    key: "contract_structure",
    label: "Contract structure",
    theme: "Revenue quality",
    brief:
      "The economics live in the contract terms, not the income statement: pass-through clauses, take-or-pay minimums, cost-plus versus fixed price, auto-renewal, or liability the buyer inherits.",
  },
  {
    key: "management_incentives",
    label: "Management and incentives",
    theme: "People and governance",
    brief:
      "The deal hinges on people — a founder whose relationships are the business, a management team whose earn-out drives short-term behaviour, thin bench depth, or a seller staying on with misaligned incentives.",
  },
  {
    key: "regulatory_exposure",
    label: "Regulatory exposure",
    theme: "External risk",
    brief:
      "A pending rule, reimbursement change, licensing regime or classification question sits outside the financials but determines the outcome.",
  },
  {
    key: "diligence_dependent",
    label: "Diligence-dependent",
    theme: "Diligence judgment",
    brief:
      "The financials cannot settle it. The answer depends on what customer calls, a technical review, or channel checks would reveal — and a strong candidate says exactly what they would ask and what answer would change their mind.",
  },
  {
    key: "multi_segment",
    label: "Segment disaggregation",
    theme: "Unit economics",
    brief:
      "A blended business hides two very different companies — one attractive, one structurally weak. Consolidated metrics are meaningless until they are pulled apart.",
  },
  {
    key: "roll_up_flywheel",
    label: "Roll-up flywheel",
    theme: "Value creation",
    brief:
      "An acquisitive platform whose reported growth is bought rather than earned. The live questions are organic growth underneath, integration quality, and whether the acquisition-multiple spread still exists.",
  },
  {
    key: "clean_compounder",
    label: "Clean compounder",
    theme: "Value creation",
    brief:
      "A genuinely good business with defensible economics, legitimate add-backs and no hidden landmine. The work is deciding whether the price is justified and where returns actually come from — not hunting for a problem that is not there.",
  },
  {
    key: "turnaround_timing",
    label: "Cyclicality and timing",
    theme: "Earnings quality",
    brief:
      "Earnings sit somewhere unusual in a cycle — genuinely depressed, genuinely peak, or ambiguous. The candidate must form a view on the normalised level rather than assume the direction.",
  },
  {
    key: "earnings_quality",
    label: "Earnings quality",
    theme: "Earnings quality",
    brief:
      "Reported profitability needs adjustment before any multiple means anything — pro-forma assumptions, one-time items presented as recurring, or accounting choices that flatter the run rate. Use sparingly; it must not be the default shape of every case.",
  },
];

/** How the case should resolve. Varied deliberately so "pass" stops being the
 *  safe default guess. */
export type VerdictShape = "invest" | "pass" | "conditional" | "ambiguous";

export const VERDICT_SHAPES: { key: VerdictShape; brief: string }[] = [
  {
    key: "invest",
    brief:
      "The evidence supports investing at or near the asking price. The obvious objections exist but do NOT hold up under scrutiny, and the case must contain the evidence that defeats them. A candidate who reflexively passes is wrong and should lose points. Your returns sketch must actually clear a PE hurdle (high-teens IRR or better) at the stated price.",
  },
  {
    key: "pass",
    brief:
      "The evidence supports passing, on a specific and defensible ground — not a general sense of unease. The returns must genuinely fail at the asking price, and the case should still contain real strengths so passing requires judgment rather than pattern-matching.",
  },
  {
    key: "conditional",
    brief:
      "Neither yes nor no on the terms offered. The deal works at a different price, or contingent on a named diligence finding. The candidate's job is to say what they would pay and what would change their mind — the case must contain enough to price it, and the returns must be near the hurdle rather than obviously above or below.",
  },
  {
    key: "ambiguous",
    brief:
      "Genuinely balanced. Two strong candidates could reach opposite conclusions and both be defensible. Build real evidence on BOTH sides — the reasoning is what is graded, never the label.",
  },
];

/** Real investment decisions are rarely binary, so the two shapes that force a
 *  formed opinion rather than a yes/no carry the majority of the weight. */
export const VERDICT_MIX: { key: VerdictShape; weight: number }[] = [
  { key: "conditional", weight: 32 },
  { key: "ambiguous", weight: 26 },
  { key: "pass", weight: 22 },
  { key: "invest", weight: 20 },
];

export function pickVerdictShape(rand = Math.random()): VerdictShape {
  const total = VERDICT_MIX.reduce((a, v) => a + v.weight, 0);
  let roll = rand * total;
  for (const v of VERDICT_MIX) {
    roll -= v.weight;
    if (roll <= 0) return v.key;
  }
  return "conditional";
}

// A data room isn't 41 variations of one table. These are the artefacts a deal
// team actually reads: financial schedules, yes, but also call notes, verbatim
// management claims, contract and customer lists, trend series and event
// chronologies. Old cases stored plain tables, so `kind` defaults accordingly.
export interface ExhibitTableData {
  kind: "table";
  title: string;
  columns: string[];
  rows: (string | number)[][];
  footnote?: string;
}
/** Diligence call notes, an internal memo, an email thread — prose the team
 *  would have on file, with all its hedging and irrelevance intact. */
export interface ExhibitNote {
  kind: "note";
  title: string;
  /** e.g. "Notes — call with VP Sales, 14 Mar" */
  source?: string;
  body: string;
  footnote?: string;
}
/** Something a person actually said, on the record, unedited. */
export interface ExhibitQuote {
  kind: "quote";
  title: string;
  speaker?: string;
  body: string;
  footnote?: string;
}
/** Customers, contracts, facilities, covenants — itemised, not tabulated. */
export interface ExhibitList {
  kind: "list";
  title: string;
  items: { label: string; value?: string | number; note?: string }[];
  footnote?: string;
}
/** A trend the candidate must read off a shape rather than a table. */
export interface ExhibitChart {
  kind: "chart";
  title: string;
  unit?: string;
  series: { label: string; points: { x: string | number; y: number }[] }[];
  footnote?: string;
}
/** Chronology — when things happened is often the whole insight. */
export interface ExhibitTimeline {
  kind: "timeline";
  title: string;
  events: { when: string; what: string }[];
  footnote?: string;
}

export type Exhibit =
  | ExhibitTableData
  | ExhibitNote
  | ExhibitQuote
  | ExhibitList
  | ExhibitChart
  | ExhibitTimeline;

export const EXHIBIT_KINDS = ["table", "note", "quote", "list", "chart", "timeline"] as const;

export interface RubricDimension {
  key: string;          // structure | quant | judgment | comms | prioritization
  label: string;
  weight: number;       // integer percentages, sum to 100
  anchors: {            // score anchors calibrate the grader
    "90": string;
    "70": string;
    "50": string;
  };
}

export interface Rubric {
  dimensions: RubricDimension[];
}

// what generate-case returns (also the shape persisted on the `cases` row)
export interface GeneratedCase {
  title: string;
  prompt: string;
  exhibits: Exhibit[];
  rubric: Rubric;
  /** What a top candidate must surface — supporting evidence as well as
   *  objections. Emitted by the model as `key_insights`; stored as
   *  `hidden_traps` because that is the existing column. */
  hidden_traps: string[];
  suggested_time_sec: number;
  /** For ambiguous cases: the verdicts a strong candidate could defend, and on
   *  what grounds. Grading uses this so a well-argued minority view isn't marked
   *  wrong for landing on the "other" label. */
  defensible_positions?: { verdict: string; grounds: string }[];
}

/** Durable, transferable lesson from a completed case — the thing worth writing
 *  on paper. Grouped by theme on the review sheet. */
export interface Takeaway {
  id: string;
  created_at: string;
  case_id: string;
  attempt_id: string | null;
  theme: string;
  text: string;
  case_title?: string;
  case_type?: string;
}

export interface GenerateParams {
  type: CaseType;
  length: Length;
  has_financials: boolean;
  industry: string;
  difficulty: Difficulty;
  firm_flavor?: string | null;
}

// what grade-attempt returns
export interface GradeResult {
  dimension_scores: Record<string, number>;      // keyed by rubric dimension key
  dimension_feedback: Record<string, string>;
  tests_callouts: { title: string; body: string }[];
  total: number;                                  // weighted, 0..100
}

// DB row shapes (subset used client-side)
export interface CaseRow extends GeneratedCase, GenerateParams {
  id: string;
  created_at: string;
  exemplar: string | null;
}

export interface AttemptRow {
  id: string;
  case_id: string;
  created_at: string;
  response: string;
  self_score: number | null;
  ai_score: number | null;
  dimension_scores: Record<string, number> | null;
  feedback: {
    dimensions: Record<string, string>;
    tests_callouts: { title: string; body: string }[];
  } | null;
  time_allotted_sec: number;
  time_taken_sec: number;
  submitted_early: boolean;
  flagged: boolean;
  tags: string[];
}

export const DEFAULT_DIMENSIONS: { key: string; label: string; weight: number }[] = [
  { key: "structure", label: "Structure", weight: 20 },
  { key: "quant", label: "Quantitative Accuracy", weight: 25 },
  { key: "judgment", label: "Business Judgment", weight: 30 },
  { key: "comms", label: "Communication", weight: 15 },
  { key: "prioritization", label: "Prioritization", weight: 10 },
];
