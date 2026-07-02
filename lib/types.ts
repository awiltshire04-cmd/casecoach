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

export interface Exhibit {
  kind: "table";
  title: string;
  columns: string[];
  rows: (string | number)[][];
  footnote?: string;
}

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
  hidden_traps: string[];       // the "what this was really testing" material
  suggested_time_sec: number;
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
