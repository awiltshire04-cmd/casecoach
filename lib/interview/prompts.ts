import type { Question, RubricDimension, SpeechMetrics } from "./types";
import { paceLabel, fillerLabel } from "./metrics";

function metricsBlock(m: SpeechMetrics): string {
  const pace = paceLabel(m.wpm);
  const fill = fillerLabel(m.fillerRate);
  const fillers = m.topFillers.length
    ? m.topFillers.map((f) => `"${f.word}" ×${f.count}`).join(", ")
    : "none detected";
  return [
    `- Spoken length: ${m.wordCount} words over ${m.durationSec}s`,
    `- Pace: ${m.wpm} wpm (${pace.label}; 130-160 is the target band)`,
    `- Filler words: ${m.fillerCount} total, ${m.fillerRate} per 100 words (${fill.label}) — ${fillers}`,
    `- Longest unbroken sentence: ${m.longestSentenceWords} words`,
  ].join("\n");
}

export function buildAnswerGradingMessages(args: {
  question: Question;
  transcript: string;
  metrics: SpeechMetrics;
  rubric: RubricDimension[];
  sectionLabel: string;
  inputMode: "voice" | "typed";
}) {
  const technical = args.sectionLabel === "technical";
  const system = [
    `You are a ${args.sectionLabel} interviewer at a private equity firm, grading a candidate's spoken answer.`,
    "Grade each rubric dimension INDEPENDENTLY on 0-100. Be calibrated, not generous: a competent-but-generic answer is 55-70. Reserve 85+ for answers that are specific, well-structured and would genuinely impress on the day. Do not inflate.",
    technical
      ? "This is a TECHNICAL question with a right answer. Correctness dominates: identify any factual or directional error explicitly and say what the right answer was. Do not award credit for confident delivery of a wrong answer. If a number is wrong, state the correct one."
      : "",
    "You are given objective speech metrics. Use them as the factual basis for the delivery score rather than guessing at pacing from the text.",
    "Quote the candidate's actual words when giving feedback. Never invent detail they did not say.",
    "Return ONLY valid minified JSON, no prose, no markdown fences.",
  ].join(" ");

  const rubricText = args.rubric
    .map((d) => `- ${d.key} (${d.label}, weight ${d.weight}): ${d.probe}`)
    .join("\n");

  const modeNote =
    args.inputMode === "typed"
      ? "\nNOTE: this answer was TYPED, not spoken. Score delivery on written fluency and hedging only, and say so in the delivery note rather than commenting on pacing."
      : "\nNOTE: this is an automatic speech transcript. Ignore punctuation and capitalisation artefacts; do not penalise transcription errors of proper nouns or finance terms.";

  const user = `QUESTION ASKED:
${args.question.prompt}

WHAT A STRONG ANSWER CONTAINS:
${args.question.guidance ?? "Use your judgment as an experienced interviewer."}

OBJECTIVE SPEECH METRICS:
${metricsBlock(args.metrics)}
${modeNote}

CANDIDATE'S ANSWER (transcript):
"""
${args.transcript}
"""

RUBRIC — score each dimension 0-100 against its probe:
${rubricText}

For each dimension also write one or two sentences of specific feedback referencing what the candidate actually said.

Then give actionable feedback:
- worked: 2-3 things that genuinely landed (specific, quoted where possible)
- cut: 1-3 things to remove — filler, throat-clearing, tangents, over-hedging
- add: 1-3 concrete things missing that would raise the score
- rewrites: 1-2 short before/after pairs taking a weak phrase they actually used and showing a sharper version. "before" MUST be a phrase from the transcript.

Return JSON exactly:
{"breakdown":{${args.rubric.map((d) => `"${d.key}":int`).join(",")}},"dimension_notes":{${args.rubric
    .map((d) => `"${d.key}":string`)
    .join(",")}},"feedback":{"worked":[string],"cut":[string],"add":[string],"rewrites":[{"before":string,"after":string}]}}`;

  return { system, user };
}

// The interviewer decides whether to probe — the point is that a good answer is
// left alone. Mechanical follow-ups on every question train the wrong instinct.
export function buildFollowUpMessages(args: {
  question: Question;
  transcript: string;
  /** Empty when the decision runs before grading (deferred interview mode). */
  breakdown: Record<string, number>;
}) {
  const system = [
    "You are a private equity interviewer deciding whether to probe further after a candidate's answer.",
    "There is ALWAYS another question you could ask. That is not the test. The test is whether this answer has a MATERIAL GAP — something missing that would actually change your assessment of the candidate.",
    "Default to NOT asking. In a real interview most competent answers get a nod and the interviewer moves on; probing every answer is a tic, not rigour.",
    "Return ONLY valid minified JSON, no prose, no markdown fences.",
  ].join(" ");

  const hasScores = Object.keys(args.breakdown ?? {}).length > 0;
  const user = `QUESTION ASKED:
${args.question.prompt}

CANDIDATE'S ANSWER:
"""
${args.transcript}
"""
${hasScores ? `\nDIMENSION SCORES JUST AWARDED: ${JSON.stringify(args.breakdown)}\n` : ""}
A follow-up IS warranted when:
- The answer stayed generic where the question demanded specifics (no company, no numbers, no personal role).
- It asserted something central without support ("we improved margins", "it's a great business") and the support is the whole point.
- It skipped the "so what" — described activity but never reached an outcome, insight or view.
- It left a thread hanging that a sharp interviewer would not let pass, and the candidate clearly has more to say.

A follow-up is NOT warranted when:
- The answer already covers the substance and you are merely curious about an adjacent detail.
- Your question would ask them to quantify something they already answered directionally and credibly.
- It is an interesting tangent rather than a gap — extending the conversation, not testing the answer.
- They pre-empted the obvious objection themselves.

Work in this order:
1. Write the strongest case for NOT asking — what did the answer already cover well?
2. Only then decide whether a genuine gap survives that case.

If the honest answer is that you are reaching, set needed to false. A strong, specific, self-aware answer should normally return false.

If you do ask, it must be one natural spoken question — short, specific to their words, not a restatement of the original.

Return JSON exactly:
{"no_case":string,"needed":boolean,"reason":string,"question":string|null}`;

  return { system, user };
}

export function buildSessionSummaryMessages(args: {
  sectionLabel: string;
  items: { prompt: string; score: number; breakdown: Record<string, number>; transcript: string }[];
}) {
  const system = [
    `You are a ${args.sectionLabel} interview coach writing the debrief after a full mock interview.`,
    "Look across every answer for PATTERNS rather than repeating per-question feedback. Name what recurs.",
    "Be direct and specific. Return ONLY valid minified JSON, no prose, no markdown fences.",
  ].join(" ");

  const body = args.items
    .map(
      (it, i) =>
        `${i + 1}. Q: ${it.prompt}\n   Score: ${it.score} ${JSON.stringify(it.breakdown)}\n   Answer: ${it.transcript.slice(0, 900)}`
    )
    .join("\n\n");

  const user = `The candidate answered ${args.items.length} question${args.items.length === 1 ? "" : "s"}:

${body}

Write the debrief: a 2-3 sentence summary of how they came across overall, 2-3 strengths that showed up repeatedly, and 2-3 priorities to fix before the real interview — ordered by how much they cost.

Return JSON exactly:
{"summary":string,"strengths":[string],"priorities":[string]}`;

  return { system, user };
}
