// Shared contract for the interview bank. Behavioral ships first; the technical
// section reuses every type here with a different rubric weighting.

export type Section = "behavioral" | "technical";

export interface Question {
  id: string;
  section: Section;
  category: string;
  prompt: string;
  difficulty: "core" | "stretch";
  source: "seed" | "book" | "generated";
  source_ref: string | null;
  concept_tags: string[];
  /** Short note to the grader: what a complete answer must contain. */
  guidance: string | null;
  /** Study-mode teaching text, written for a human who just got it wrong.
   *  Null on behavioral questions and until migration_005 has run. */
  explanation?: string | null;
}

export const BEHAVIORAL_CATEGORIES: { key: string; label: string; blurb: string }[] = [
  { key: "summer_experience", label: "Summer Experience", blurb: "What you did and what it taught you" },
  { key: "forward_looking", label: "Forward Looking", blurb: "Full-time intent and trajectory" },
  { key: "firm_specific", label: "Firm Specific", blurb: "Their portfolio, their edge, your fit" },
  { key: "investment_thesis", label: "Investment Thesis", blurb: "Pitches you can defend" },
  { key: "market_view", label: "Market View", blurb: "Trends, rates and where things go" },
];

/** Weighted 0-100. Weights differ by section — technical leans on correctness,
 *  behavioral on narrative — but the shape is identical so the UI is shared. */
export interface RubricDimension {
  key: string;
  label: string;
  weight: number;
  probe: string; // what the grader is actually judging
}

export const BEHAVIORAL_RUBRIC: RubricDimension[] = [
  {
    key: "content",
    label: "Content",
    weight: 35,
    probe:
      "Relevance and specificity. Does the answer actually answer the question asked? Are there concrete details — names, numbers, outcomes — or is it generic filler that any candidate could have said?",
  },
  {
    key: "structure",
    label: "Structure",
    weight: 25,
    probe:
      "Does it follow a coherent narrative arc — situation, then action, then outcome or insight — rather than rambling or circling? Is there a clear point, arrived at deliberately?",
  },
  {
    key: "delivery",
    label: "Delivery",
    weight: 20,
    probe:
      "Pacing, filler words and confidence, judged from the supplied speech metrics and from hedging language in the transcript. Fast-and-breathless and slow-and-hesitant are both penalised.",
  },
  {
    key: "articulation",
    label: "Articulation",
    weight: 20,
    probe:
      "Word choice and precision. Is the vocabulary exact and industry-appropriate? Does it sound natural and conversational, or memorised, robotic and over-rehearsed?",
  },
];

export const TECHNICAL_CATEGORIES: { key: string; label: string; blurb: string }[] = [
  { key: "accounting", label: "Accounting", blurb: "Statements, working capital, leases" },
  { key: "debt", label: "Debt", blurb: "Instruments, pricing, credit stats" },
  { key: "valuation", label: "Valuation", blurb: "Multiples, DCF, cost of capital" },
  { key: "pro_forma", label: "Pro Forma", blurb: "Accretion / dilution, combinations" },
  { key: "returns", label: "Returns Math", blurb: "IRR, MoM, CAGR, NPV" },
  { key: "capital_structure", label: "Capital Structure", blurb: "Leverage, tranches, covenants" },
  { key: "operating_leverage", label: "Operating Leverage", blurb: "Fixed vs variable cost behaviour" },
  { key: "lbo", label: "LBO Theory", blurb: "Deal mechanics and value drivers" },
  { key: "growth_equity", label: "Growth Equity", blurb: "Minority stakes, structuring, growth" },
  { key: "investor_judgment", label: "Investor Judgment", blurb: "Thinking like an investor" },
  { key: "modeling", label: "Modeling", blurb: "Paper LBO and modelling-test math" },
  { key: "misc", label: "Loose Ends", blurb: "Everything else that comes up" },
];

// Technical answers live or die on being right. Narrative arc — which carries a
// quarter of the behavioral score — is worth almost nothing here, so the weights
// shift onto correctness and completeness rather than reusing the same rubric.
export const TECHNICAL_RUBRIC: RubricDimension[] = [
  {
    key: "correctness",
    label: "Correctness",
    weight: 45,
    probe:
      "Is the answer factually right? Are the mechanics, directions of change and any numbers correct? A confident wrong answer scores below a hesitant right one. Penalise errors in proportion to how central they are.",
  },
  {
    key: "completeness",
    label: "Completeness",
    weight: 25,
    probe:
      "Did they cover everything the question actually asked — every statement, every step, every caveat that matters? Note specifically what was omitted.",
  },
  {
    key: "reasoning",
    label: "Reasoning",
    weight: 20,
    probe:
      "Did they show why, not just what? Reciting a memorised definition without the underlying mechanism scores low even when correct. Reward candidates who reason from first principles.",
  },
  {
    key: "communication",
    label: "Communication",
    weight: 10,
    probe:
      "Was it delivered crisply and in a logical order, with precise terminology? Judge pacing and filler from the supplied speech metrics, but weight this lightly — a right answer said awkwardly still beats a wrong answer said smoothly.",
  },
];

export function rubricFor(section: Section): RubricDimension[] {
  return section === "technical" ? TECHNICAL_RUBRIC : BEHAVIORAL_RUBRIC;
}

export interface AnswerFeedback {
  worked: string[];
  cut: string[];
  add: string[];
  rewrites: { before: string; after: string }[];
}

export interface SpeechMetrics {
  wordCount: number;
  durationSec: number;
  wpm: number;
  fillerCount: number;
  fillerRate: number; // fillers per 100 words
  topFillers: { word: string; count: number }[];
  longestSentenceWords: number;
}

export interface AttemptGrade {
  score: number; // 0-100, weighted in code
  breakdown: Record<string, number>;
  dimensionNotes: Record<string, string>;
  feedback: AnswerFeedback;
  metrics: SpeechMetrics;
}

export interface FollowUp {
  asked: boolean;
  reason: string;
  question: string | null;
  transcript?: string;
}

export interface AttemptRow {
  id: string;
  created_at: string;
  question_id: string;
  session_id: string | null;
  ordinal: number | null;
  transcript: string;
  input_mode: "voice" | "typed";
  duration_sec: number | null;
  word_count: number | null;
  score: number | null;
  breakdown: Record<string, number> | null;
  feedback: AnswerFeedback | null;
  metrics: SpeechMetrics | null;
  followup: FollowUp | null;
  flagged: boolean;
  flag_reason: string | null;
}

export interface SessionOverall {
  score: number;
  summary: string;
  strengths: string[];
  priorities: string[];
}
