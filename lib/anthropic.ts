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

/** Extract the first complete top-level JSON object by matching braces, ignoring
 *  braces inside string literals. Slicing to the LAST `}` breaks whenever the
 *  model appends a second block or trailing prose containing a brace. */
function firstJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null; // truncated mid-object
}

// Strip accidental markdown fences and parse. Throws on failure so callers can retry.
export function parseJson<T>(raw: string): T {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  try {
    return JSON.parse(s) as T;
  } catch {
    const salvaged = firstJsonObject(s);
    if (!salvaged) throw new Error("No complete JSON object in model output (likely truncated).");
    return JSON.parse(salvaged) as T;
  }
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
