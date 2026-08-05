// Shared client-side fetch wrapper.
//
// Our API routes always answer with JSON, but the *platform* underneath them
// doesn't: when a serverless function exceeds its duration limit or crashes,
// Vercel replaces the response with a text/plain page that starts
// "An error occurred with this application." Calling res.json() on that throws
// `Unexpected token 'A', "An error o"... is not valid JSON`, which tells the
// user nothing. Read the body as text first and translate it.

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();

  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON — handled below */
    }
  }

  if (json && typeof json === "object") {
    if (!res.ok) {
      const msg = (json as { error?: string }).error;
      throw new Error(msg || `Request failed (${res.status}).`);
    }
    return json as T;
  }

  throw new Error(platformError(res.status, text));
}

function platformError(status: number, body: string): string {
  const b = body.trim();

  if (status === 504 || /TIMEOUT/i.test(b)) {
    return "The server ran out of time on this request. Model generation can take 60-90 seconds; if this keeps happening, retry or pick a shorter case length.";
  }
  if (/FUNCTION_INVOCATION_FAILED|FUNCTION_PAYLOAD/i.test(b)) {
    return `The server function failed before it could reply (${status}). Check the deployment logs for the failing route.`;
  }
  if (/An error occurred with this application/i.test(b)) {
    return `The hosting platform returned an error page instead of a response (${status}): ${b.replace(/\s+/g, " ").slice(0, 120)}`;
  }
  if (!b) return `Empty response from the server (${status}).`;
  return `Unexpected non-JSON response (${status}): ${b.replace(/\s+/g, " ").slice(0, 160)}`;
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error("Network error — the request never reached the server.");
  }
  return parse<T>(res);
}

export function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiFetch<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
