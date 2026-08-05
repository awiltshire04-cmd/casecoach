import type { SpeechMetrics } from "./types";

// Delivery is the one dimension a language model cannot judge from a transcript
// alone — "um" density and words-per-minute are facts, not opinions. We compute
// them deterministically and hand them to the grader as evidence, which keeps
// the delivery score anchored instead of imagined.

const FILLERS = [
  "um", "uh", "erm", "ah", "like", "basically", "actually", "literally",
  "honestly", "obviously", "essentially", "sort of", "kind of", "you know",
  "i mean", "i guess", "right?", "so yeah", "or whatever",
];

// Hedges read as low confidence even when the filler count is clean.
export const HEDGES = [
  "i think maybe", "i'm not sure", "kind of think", "probably", "i would say",
  "sort of like", "i don't know if", "hopefully", "i feel like",
];

function countPhrase(haystack: string, phrase: string): number {
  // Word-boundary match so "like" doesn't fire inside "likely".
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[^a-z])${escaped}(?:[^a-z]|$)`, "g");
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(haystack)) !== null) {
    n += 1;
    re.lastIndex = m.index + 1; // allow overlapping matches
  }
  return n;
}

export function speechMetrics(transcript: string, durationSec: number): SpeechMetrics {
  const clean = transcript.trim();
  const words = clean ? clean.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;
  const lower = ` ${clean.toLowerCase()} `;

  const counts: { word: string; count: number }[] = [];
  let fillerCount = 0;
  for (const f of FILLERS) {
    const n = countPhrase(lower, f);
    if (n > 0) {
      counts.push({ word: f, count: n });
      fillerCount += n;
    }
  }
  counts.sort((a, b) => b.count - a.count);

  const sentences = clean.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const longestSentenceWords = sentences.reduce(
    (max, s) => Math.max(max, s.split(/\s+/).filter(Boolean).length),
    0
  );

  const safeDuration = durationSec > 0 ? durationSec : 0;
  return {
    wordCount,
    durationSec: Math.round(safeDuration),
    wpm: safeDuration > 0 ? Math.round((wordCount / safeDuration) * 60) : 0,
    fillerCount,
    fillerRate: wordCount > 0 ? Math.round((fillerCount / wordCount) * 1000) / 10 : 0,
    topFillers: counts.slice(0, 4),
    longestSentenceWords,
  };
}

/** Plain-language read on pace. Interview delivery sits around 130-160 wpm. */
export function paceLabel(wpm: number): { label: string; tone: "good" | "warn" | "bad" } {
  if (wpm === 0) return { label: "not measured", tone: "warn" };
  if (wpm < 105) return { label: "slow — may read as hesitant", tone: "warn" };
  if (wpm <= 165) return { label: "conversational", tone: "good" };
  if (wpm <= 190) return { label: "brisk", tone: "warn" };
  return { label: "rushed", tone: "bad" };
}

export function fillerLabel(rate: number): { label: string; tone: "good" | "warn" | "bad" } {
  if (rate <= 1.5) return { label: "clean", tone: "good" };
  if (rate <= 3.5) return { label: "noticeable", tone: "warn" };
  return { label: "distracting", tone: "bad" };
}

/** Weighted total, computed here rather than by the model so the arithmetic is
 *  deterministic across attempts (same approach as the case grader). */
export function weightedScore(
  breakdown: Record<string, number>,
  rubric: { key: string; weight: number }[]
): number {
  let sum = 0;
  let weight = 0;
  for (const d of rubric) {
    const s = breakdown[d.key];
    if (typeof s === "number" && Number.isFinite(s)) {
      sum += Math.max(0, Math.min(100, s)) * d.weight;
      weight += d.weight;
    }
  }
  return weight ? Math.round(sum / weight) : 0;
}
