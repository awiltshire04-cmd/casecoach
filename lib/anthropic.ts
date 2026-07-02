import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;

// Split models per the plan: a faster model for generation, a stronger one for
// grading (where quality matters most). Override via env if desired.
export const MODELS = {
  generate: process.env.GENERATE_MODEL || "claude-sonnet-4-6",
  grade: process.env.GRADE_MODEL || "claude-opus-4-8",
  exemplar: process.env.EXEMPLAR_MODEL || "claude-sonnet-4-6",
  trends: process.env.TRENDS_MODEL || "claude-sonnet-4-6",
} as const;

export function getClient() {
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (local) and your Vercel project settings (deploy)."
    );
  }
  return new Anthropic({ apiKey });
}

// Pull the concatenated text out of a messages response.
export function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// Strip accidental markdown fences and parse. Throws on failure so callers can retry.
export function parseJson<T>(raw: string): T {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  // Salvage: grab the outermost JSON object if there's stray prose.
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first > 0 || last < s.length - 1) {
    if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
  }
  return JSON.parse(s) as T;
}

// One-shot JSON call with a single malformed-output retry.
export async function jsonCall<T>(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<T> {
  const client = getClient();
  const run = async (): Promise<string> => {
    const msg = await client.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
    return textOf(msg);
  };

  const raw = await run();
  try {
    return parseJson<T>(raw);
  } catch {
    // retry once, nudging toward clean JSON
    const msg2 = await getClient().messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system + " CRITICAL: output must be a single valid JSON object and nothing else.",
      messages: [{ role: "user", content: opts.user }],
    });
    return parseJson<T>(textOf(msg2));
  }
}

// Plain-text call (for the exemplar).
export async function textCall(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const client = getClient();
  const msg = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  return textOf(msg);
}
