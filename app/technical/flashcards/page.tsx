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

const PROGRESS_KEY = "casecoach:flashcards:technical";

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
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [hideSeen, setHideSeen] = useState(false);
  const [restored, setRestored] = useState(false);
  const prefetched = useRef<Set<string>>(new Set());

  // Review progress is per-device study state, not shared data, so it lives in
  // localStorage — no migration, and it survives a reload, which is the point.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { seen?: string[]; missed?: string[] };
        setSeen(new Set(p.seen ?? []));
        setMissed(new Set(p.missed ?? []));
      }
    } catch {
      /* corrupt or unavailable storage just means starting fresh */
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return; // don't clobber saved progress with the empty initial state
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({ seen: [...seen], missed: [...missed] }));
    } catch {
      /* quota or private mode — progress just won't persist */
    }
  }, [seen, missed, restored]);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ questions: Question[] }>("/api/interview/questions?section=technical");
        setDeck(res.questions ?? []);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load the deck");
        setDeck([]);
      }
      // Which cards are already flagged, so the control reflects the database
      // rather than whatever the previous card left behind.
      try {
        const f = await apiFetch<{ items: { question: { id: string } }[] }>(
          "/api/interview/flag?section=technical"
        );
        setFlaggedIds(new Set((f.items ?? []).map((i) => i.question.id)));
      } catch {
        /* non-fatal: flagging still works, the chip just won't pre-fill */
      }
    })();
  }, []);

  const filtered = useMemo(
    () =>
      (deck ?? []).filter(
        (q) =>
          (!category || q.category === category) &&
          (source === "all" || q.source === source) &&
          (!stretchOnly || q.difficulty === "stretch") &&
          (!hideSeen || !seen.has(q.id))
      ),
    // `seen` deliberately excluded: re-filtering mid-card would yank the deck
    // out from under you the moment a card is marked seen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deck, category, source, stretchOnly, hideSeen]
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
  }, [filtered.length, category, source, stretchOnly, hideSeen]);

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
        <button
          className={`chip${stretchOnly ? " blue" : ""}`}
          style={{ cursor: "pointer" }}
          onClick={() => setStretchOnly((v) => !v)}
          title="Stretch = multi-step reasoning, a curveball, or something most candidates fumble. Core = the definitional and single-step questions."
        >
          Stretch only
        </button>
        <button
          className={`chip${hideSeen ? " blue" : ""}`}
          style={{ cursor: "pointer" }}
          onClick={() => setHideSeen((v) => !v)}
          title="Hide cards you've already revealed in a previous session"
        >
          Hide seen
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
            <span className="chip" title="Cards you've revealed, saved on this device">
              {seen.size} seen
            </span>
            {missed.size > 0 && <span className="chip bad">{missed.size} to revisit</span>}
            {card?.difficulty === "stretch" && (
              <span
                className="chip warn"
                title="Multi-step reasoning, a curveball, or something most candidates fumble"
              >
                Stretch
              </span>
            )}
            {card?.source === "generated" && <span className="chip accent">Extension</span>}
            {card && flaggedIds.has(card.id) && <span className="chip warn">Flagged</span>}
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
                {/* keyed so the control remounts per card and can never carry
                    the previous card's flag state forward */}
                <FlagControl
                  key={card.id}
                  questionId={card.id}
                  initiallyFlagged={flaggedIds.has(card.id)}
                  label="Flag for study mode"
                  onChange={(f) =>
                    setFlaggedIds((s) => {
                      const n = new Set(s);
                      if (f) n.add(card.id);
                      else n.delete(card.id);
                      return n;
                    })
                  }
                />
              </>
            )}
            {!revealed && <button onClick={() => step(1)}>Skip →</button>}
            <div className="spacer" />
            {pos === filtered.length - 1 && revealed && (
              <span className="sub">End of deck — change a filter to reshuffle.</span>
            )}
            {seen.size > 0 && (
              <button
                className="ghost sm"
                onClick={() => {
                  if (confirm(`Clear your progress on ${seen.size} seen card(s)? Flags are kept.`)) {
                    setSeen(new Set());
                    setMissed(new Set());
                    setHideSeen(false);
                  }
                }}
              >
                Reset progress
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
