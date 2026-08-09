import { createClient } from "@supabase/supabase-js";
import type { Exhibit } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Browser/client-safe (anon) — used by client components for reads/writes.
// Single-user v1 has no RLS; add RLS + Auth before exposing to multiple users.
export function browserClient() {
  if (!url || !anonKey) {
    throw new Error("Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createClient(url, anonKey);
}

// Server-side (service role) — used inside API routes.
//
// Next patches global fetch and caches GET requests made inside route handlers.
// supabase-js uses fetch, so query results were being served from the data
// cache: the dashboard returned a months-old snapshot (4 activity events when
// the database held 37) and no amount of reloading refreshed it. Every read
// here is live user data, so opt out explicitly rather than relying on route
// segment config to cover it.
export function serviceClient() {
  if (!url || !serviceKey) {
    throw new Error("Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

// Render exhibits as compact text so the grader (and exemplar) can read them.
export function exhibitsToText(exhibits: Exhibit[]): string {
  if (!exhibits?.length) return "";
  return exhibits
    .map((ex) => {
      const header = ex.columns.join(" | ");
      const sep = ex.columns.map(() => "---").join(" | ");
      const body = ex.rows.map((r) => r.join(" | ")).join("\n");
      const foot = ex.footnote ? `\n(${ex.footnote})` : "";
      return `${ex.title}\n${header}\n${sep}\n${body}${foot}`;
    })
    .join("\n\n");
}
