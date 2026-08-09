"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/http";
import { FlagControl } from "@/components/interview/FlagControl";
import { TECHNICAL_CATEGORIES, type Question } from "@/lib/interview/types";

// No AI calls: every technical question already carries a written explanation,
// so a card flip is a database read. The deck list stays lean and each answer is
// fetched on reveal (~1KB) rather than shipping 600 explanations up front.

type SourceFilter = "all" | "book" | "generated";

export default function FlashcardsPage() {
  const [deck, setDeck] = useState<Question[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [source, setSource] = useState<SourceFilter>("all");
  const [stretchOnly, setStretchOnly] = useState(false);

  const [order, setOrder] = useState<number[]>([]);
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loadingAnswer, setLoadingAnswer] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [missed, setMissed] = useState<Set<string>>(new Set());
  const prefetched = useRef<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ questions: Question[] }>("/api/interview/questions?section=technical");
        setDeck(res.questions ?? []);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load the deck");
        setDeck([]);
      }
    })();
  }, []);

  const filtered = useMemo(
    () =>
      (deck ?? []).filter(
        (q) =>
          (!category || q.category === category) &&
          (source === "all" || q.source === source) &&
          (!stretchOnly || q.difficulty === "stretch")
      ),
    [deck, category, source, stretchOnly]
  );

  // Reshuffle whenever the filters change the deck.
  useEffect(() => {
    const idxs = filtered.map((_, i) => i);
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
    setOrder(idxs);
    setPos(0);
    setRevealed(false);
  }, [filtered.length, category, source, stretchOnly]);

  const card = filtered[order[pos]] ?? null;

  const fetchAnswer = useCallback(
    async (id: string) => {
      if (!id || answers[id]) return;
      try {
        const res = await apiFetch<{ question: Question }>(
          `/api/interview/questions?id=${encodeURIComponent(id)}`
        );
        const text = res.question?.explanation ?? res.question?.guidance ?? "No explanation stored for this one.";
        setAnswers((a) => ({ ...a, [id]: text }));
      } catch {
        setAnswers((a) => ({ ...a, [id]: "Couldn't load the explanation — check your connection." }));
      }
    },
    [answers]
  );

  // Warm the next card while the current one is on screen.
  useEffect(() => {
    const next = filtered[order[pos + 1]];
    if (next && !prefetched.current.has(next.id)) {
      prefetched.current.add(next.id);
      fetchAnswer(next.id);
    }
  }, [pos, order, filtered, fetchAnswer]);

  const reveal = useCallback(async () => {
    if (!card || revealed) return;
    setRevealed(true);
    setSeen((s) => new Set(s).add(card.id));
    if (!answers[card.id]) {
      setLoadingAnswer(true);
      await fetchAnswer(card.id);
      setLoadingAnswer(false);
    }
  }, [card, revealed, answers, fetchAnswer]);

  const step = useCallback(
    (delta: number) => {
      setPos((p) => Math.min(Math.max(0, p + delta), Math.max(0, order.length - 1)));
      setRevealed(false);
    },
    [order.length]
  );

  // Space reveals, arrows navigate — the deck should be usable without the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); revealed ? step(1) : reveal(); }
      else if (e.code === "ArrowRight") step(1);
      else if (e.code === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, reveal, step]);

  const loading = deck === null;
  const catLabel = (k: string) => TECHNICAL_CATEGORIES.find((c) => c.key === k)?.label ?? k;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Technical · Flashcards</div>
          <h1>Self-paced review</h1>
          <p className="sub">
            Question, then the answer when you want it. No grading, no timer — space to flip, arrows to move.
          </p>
        </div>
        <div className="row no-print">
          <Link href="/technical/study"><button className="ghost">Study flagged</button></Link>
          <Link href="/technical"><button className="ghost">← Bank</button></Link>
        </div>
      </div>

      {err && <div className="callout error" style={{ marginBottom: "var(--s5)" }}><p>{err}</p></div>}

      <div className="row wrap no-print" style={{ marginBottom: "var(--s4)" }}>
        <button className={`chip${category === null ? " blue" : ""}`} style={{ cursor: "pointer" }} onClick={() => setCategory(null)}>
          All topics
        </button>
        {TECHNICAL_CATEGORIES.filter((c) => (deck ?? []).some((q) => q.category === c.key)).map((c) => (
          <button
            key={c.key}
            className={`chip${category === c.key ? " blue" : ""}`}
            style={{ cursor: "pointer" }}
            onClick={() => setCategory(category === c.key ? null : c.key)}
          >
            {c.label}
          </button>
        ))}
        <div className="spacer" />
        {(["all", "book", "generated"] as const).map((s) => (
          <button key={s} className={`chip${source === s ? " blue" : ""}`} style={{ cursor: "pointer" }} onClick={() => setSource(s)}>
            {s === "all" ? "All" : s === "book" ? "Handbook" : "Extensions"}
          </button>
        ))}
        <button className={`chip${stretchOnly ? " blue" : ""}`} style={{ cursor: "pointer" }} onClick={() => setStretchOnly((v) => !v)}>
          Stretch only
        </button>
      </div>

      {loading ? (
        <div className="card"><div className="skel skel-block" style={{ height: 220 }} /></div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <strong>No cards match</strong>
          Loosen a filter, or seed the technical bank first.
        </div>
      ) : (
        <>
          <div className="row wrap" style={{ marginBottom: "var(--s3)" }}>
            <span className="chip">{pos + 1} of {filtered.length}</span>
            <span className="chip">{seen.size} seen</span>
            {missed.size > 0 && <span className="chip bad">{missed.size} to revisit</span>}
            {card?.difficulty === "stretch" && <span className="chip warn">Stretch</span>}
            {card?.source === "generated" && <span className="chip accent">Extension</span>}
            {card && <span className="chip">{catLabel(card.category)}</span>}
            <div className="spacer" />
            <span className="sub">space = flip · ← → = move</span>
          </div>

          <div className={`flashcard${revealed ? " flipped" : ""}`} onClick={() => (revealed ? undefined : reveal())}>
            <div className="fc-q">{card?.prompt}</div>
            {revealed ? (
              <div className="fc-a">
                {loadingAnswer && !answers[card?.id ?? ""] ? (
                  <span className="sub"><span className="spin" /> loading…</span>
                ) : (
                  answers[card?.id ?? ""]
                )}
              </div>
            ) : (
              <button className="accent" onClick={reveal}>Reveal answer</button>
            )}
          </div>

          <div className="row wrap no-print" style={{ marginTop: "var(--s4)" }}>
            <button onClick={() => step(-1)} disabled={pos === 0}>← Previous</button>
            {revealed && card && (
              <>
                <button
                  className="primary"
                  onClick={() => {
                    setMissed((m) => { const n = new Set(m); n.delete(card.id); return n; });
                    step(1);
                  }}
                >
                  Got it →
                </button>
                <button
                  onClick={() => {
                    setMissed((m) => new Set(m).add(card.id));
                    step(1);
                  }}
                >
                  Didn&apos;t get it →
                </button>
                <FlagControl questionId={card.id} label="Flag for study mode" />
              </>
            )}
            {!revealed && <button onClick={() => step(1)}>Skip →</button>}
            <div className="spacer" />
            {pos === filtered.length - 1 && revealed && (
              <span className="sub">End of deck — change a filter to reshuffle.</span>
            )}
          </div>
        </>
      )}
    </>
  );
}
