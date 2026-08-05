"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/http";

// Flagging is two different admissions — "I got it wrong" and "I don't follow
// this at all" — and study mode shows the distinction, so capture which one.
export function FlagControl({
  questionId,
  initiallyFlagged = false,
  label = "Flag this question",
  onChange,
}: {
  questionId: string;
  initiallyFlagged?: boolean;
  label?: string;
  onChange?: (flagged: boolean) => void;
}) {
  const [flagged, setFlagged] = useState(initiallyFlagged);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function set(next: boolean, reason?: "wrong" | "unclear") {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch("/api/interview/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, flagged: next, reason }),
      });
      setFlagged(next);
      onChange?.(next);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update the flag");
    } finally {
      setBusy(false);
    }
  }

  if (flagged) {
    return (
      <div className="row">
        <span className="chip warn">Flagged for study</span>
        <button className="ghost sm" onClick={() => set(false)} disabled={busy}>
          {busy ? "…" : "I'm comfortable now"}
        </button>
        {err && <span className="sub" style={{ color: "var(--bad)" }}>{err}</span>}
      </div>
    );
  }

  return (
    <div className="row wrap">
      {open ? (
        <>
          <span className="sub">Why?</span>
          <button className="sm" onClick={() => set(true, "wrong")} disabled={busy}>
            I got it wrong
          </button>
          <button className="sm" onClick={() => set(true, "unclear")} disabled={busy}>
            I don&apos;t understand it
          </button>
          <button className="ghost sm" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </button>
        </>
      ) : (
        <button className="sm" onClick={() => setOpen(true)} disabled={busy}>
          {label}
        </button>
      )}
      {err && <span className="sub" style={{ color: "var(--bad)" }}>{err}</span>}
    </div>
  );
}
