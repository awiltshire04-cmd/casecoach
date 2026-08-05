"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/http";
import { FlagControl } from "@/components/interview/FlagControl";
import { scoreClass } from "@/components/Pieces";
import { TECHNICAL_CATEGORIES, type Question } from "@/lib/interview/types";

interface StudyItem {
  attemptId: string;
  flaggedAt: string;
  reason: string | null;
  lastScore: number | null;
  question: Question & { explanation: string | null };
}

export default function StudyModePage() {
  const [items, setItems] = useState<StudyItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [cleared, setCleared] = useState<Set<string>>(new Set());

  async function load() {
    try {
      const res = await apiFetch<{ items: StudyItem[] }>("/api/interview/flag?section=technical");
      setItems(res.items ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load your flagged questions");
      setItems([]);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const loading = items === null;
  const live = (items ?? []).filter((i) => !cleared.has(i.question.id));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Technical · Study mode</div>
          <h1>Questions you flagged</h1>
          <p className="sub">
            The ones you got wrong or didn&apos;t follow, with the concept explained plainly. Clear a question once
            you&apos;re comfortable and it drops off this list.
          </p>
        </div>
        <Link href="/technical">
          <button className="ghost">← Back to bank</button>
        </Link>
      </div>

      {err && (
        <div className="callout error" style={{ marginBottom: "var(--s5)" }}>
          <p>{err}</p>
        </div>
      )}

      {loading ? (
        <div className="stack">
          {Array.from({ length: 3 }).map((_, i) => (
            <div className="card" key={i}>
              <div className="skel skel-line w-60" />
              <div className="skel skel-line w-80" />
            </div>
          ))}
        </div>
      ) : live.length === 0 ? (
        <div className="empty">
          <strong>Nothing flagged</strong>
          {(items?.length ?? 0) > 0
            ? "You cleared everything in this session — nicely done."
            : "When a technical question catches you out, flag it and it collects here for review."}
        </div>
      ) : (
        <div className="stack">
          {live.map((it) => {
            const q = it.question;
            const isOpen = open.has(q.id);
            return (
              <div className="card stack studycard" key={q.id}>
                <div className="row wrap qtags">
                  <span className="chip">
                    {TECHNICAL_CATEGORIES.find((c) => c.key === q.category)?.label ?? q.category}
                  </span>
                  {it.reason === "unclear" ? (
                    <span className="chip warn">Didn&apos;t understand</span>
                  ) : (
                    <span className="chip bad">Got it wrong</span>
                  )}
                  {q.source === "generated" && <span className="chip accent">Extension</span>}
                  {it.lastScore != null && (
                    <span className="chip">
                      last score <span className={`mono ${scoreClass(it.lastScore)}`}>{it.lastScore}</span>
                    </span>
                  )}
                  <div className="spacer" />
                  <span className="sub">
                    flagged {new Date(it.flaggedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>

                <p className="qprompt">{q.prompt}</p>

                {isOpen && (
                  <div className="callout accent">
                    <h4>The concept</h4>
                    <p>{q.explanation ?? q.guidance ?? "No explanation stored for this question yet."}</p>
                  </div>
                )}

                <div className="row wrap">
                  <button className="sm" onClick={() => toggle(q.id)}>
                    {isOpen ? "Hide explanation" : "Show explanation"}
                  </button>
                  <Link href={`/technical/q/${q.id}`}>
                    <button className="sm">Try it again</button>
                  </Link>
                  <div className="spacer" />
                  <FlagControl
                    questionId={q.id}
                    initiallyFlagged
                    onChange={(flagged) => {
                      if (!flagged) setCleared((s) => new Set(s).add(q.id));
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
