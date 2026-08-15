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
// Handles every exhibit kind; anything stored before `kind` existed is a table.
export function exhibitsToText(exhibits: Exhibit[]): string {
  if (!exhibits?.length) return "";
  return exhibits
    .map((ex) => {
      const foot = ex.footnote ? `\n(${ex.footnote})` : "";
      switch (ex.kind) {
        case "note":
          return `${ex.title}${ex.source ? ` — ${ex.source}` : ""}\n${ex.body}${foot}`;
        case "quote":
          return `${ex.title}\n"${ex.body}"${ex.speaker ? ` — ${ex.speaker}` : ""}${foot}`;
        case "list":
          return `${ex.title}\n${ex.items
            .map((i) => `- ${i.label}${i.value != null ? `: ${i.value}` : ""}${i.note ? ` (${i.note})` : ""}`)
            .join("\n")}${foot}`;
        case "chart":
          return `${ex.title}${ex.unit ? ` (${ex.unit})` : ""}\n${ex.series
            .map((s) => `${s.label}: ${s.points.map((p) => `${p.x}=${p.y}`).join(", ")}`)
            .join("\n")}${foot}`;
        case "timeline":
          return `${ex.title}\n${ex.events.map((e) => `${e.when}: ${e.what}`).join("\n")}${foot}`;
        case "table":
        default: {
          const t = ex as { columns?: string[]; rows?: (string | number)[][] };
          const cols = t.columns ?? [];
          const header = cols.join(" | ");
          const sep = cols.map(() => "---").join(" | ");
          const body = (t.rows ?? []).map((r) => r.join(" | ")).join("\n");
          return `${ex.title}\n${header}\n${sep}\n${body}${foot}`;
        }
      }
    })
    .join("\n\n");
}
