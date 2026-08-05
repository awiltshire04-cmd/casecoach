"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/http";
import type { Question, Section } from "@/lib/interview/types";

// Shared question-bank screen. Behavioral and technical differ only in copy,
// category list and whether the seed/study affordances appear.
export function BankView({
  section,
  categories,
  eyebrow,
  title,
  blurb,
  interviewBlurb,
  seedable = false,
  studyHref,
}: {
  section: Section;
  categories: { key: string; label: string; blurb: string }[];
  eyebrow: string;
  title: string;
  blurb: string;
  interviewBlurb: string;
  seedable?: boolean;
  studyHref?: string;
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [setupMsg, setSetupMsg] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [source, setSource] = useState<"all" | "book" | "generated">("all");
  const [count, setCount] = useState(5);
  const [starting, setStarting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [flaggedCount, setFlaggedCount] = useState(0);

  async function load() {
    try {
      const res = await apiFetch<{ questions: Question[] }>(`/api/interview/questions?section=${section}`);
      setQuestions(res.questions ?? []);
      setSetupMsg(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load the question bank";
      if (/migration_00\d|doesn't exist/i.test(msg)) setSetupMsg(msg);
      else setErr(msg);
      setQuestions([]);
    }
  }

  useEffect(() => {
    load();
    if (studyHref) {
      apiFetch<{ items: unknown[] }>(`/api/interview/flag?section=${section}`)
        .then((r) => setFlaggedCount(r.items?.length ?? 0))
        .catch(() => setFlaggedCount(0));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const shown = useMemo(
    () =>
      (questions ?? []).filter(
        (q) => (!active || q.category === active) && (source === "all" || q.source === source)
      ),
    [questions, active, source]
  );

  const countsByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of questions ?? []) m.set(q.category, (m.get(q.category) ?? 0) + 1);
    return m;
  }, [questions]);

  const sourceCounts = useMemo(() => {
    const list = questions ?? [];
    return { book: list.filter((q) => q.source === "book").length, generated: list.filter((q) => q.source === "generated").length };
  }, [questions]);

  async function startInterview() {
    setStarting(true);
    try {
      const res = await apiFetch<{ sessionId: string; questions: Question[] }>("/api/interview/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", section, count, category: active }),
      });
      // Hand the drawn set to the interview screen so it runs exactly the
      // questions the server picked rather than drawing a second time.
      try {
        sessionStorage.setItem(
          `casecoach:interview:${res.sessionId}`,
          JSON.stringify({ questions: res.questions, idx: 0, scores: [] })
        );
      } catch {
        /* the interview screen falls back to its own draw */
      }
      router.push(`/${section}/interview/${res.sessionId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start the interview");
      setStarting(false);
    }
  }

  async function runSeed() {
    setSeeding(true);
    setErr(null);
    try {
      const res = await apiFetch<{ added: number; after: number }>("/api/interview/seed", { method: "POST" });
      await load();
      setSetupMsg(null);
      if (res.added === 0 && res.after > 0) setErr(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Seeding failed";
      if (/migration_005/i.test(msg)) setSetupMsg(msg);
      else setErr(msg);
    } finally {
      setSeeding(false);
    }
  }

  const loading = questions === null;
  const empty = !loading && (questions?.length ?? 0) === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          <p className="sub">{blurb}</p>
        </div>
        {studyHref && flaggedCount > 0 && (
          <Link href={studyHref}>
            <button className="accent">Study {flaggedCount} flagged →</button>
          </Link>
        )}
      </div>

      {setupMsg && (
        <div className="callout" style={{ marginBottom: "var(--s5)" }}>
          <h4>One setup step left</h4>
          <p>{setupMsg}</p>
        </div>
      )}
      {err && (
        <div className="callout error" style={{ marginBottom: "var(--s5)" }}>
          <p>{err}</p>
        </div>
      )}

      {seedable && empty && !setupMsg && (
        <div className="card stack" style={{ marginBottom: "var(--s6)" }}>
          <div>
            <h2>Load the question bank</h2>
            <p className="sub" style={{ margin: "0.3rem 0 0" }}>
              Every question from your PE interview handbook, plus a generated harder variant or adjacent probe for
              each one. Safe to run more than once — existing questions are left alone.
            </p>
          </div>
          <div className="row">
            <button className="primary" onClick={runSeed} disabled={seeding}>
              {seeding ? (
                <>
                  <span className="spin" /> &nbsp;Loading questions…
                </>
              ) : (
                "Seed question bank"
              )}
            </button>
          </div>
        </div>
      )}

      {/* ---- interview mode ---- */}
      {!empty && (
        <div className="card stack" style={{ marginBottom: "var(--s6)" }}>
          <div className="row wrap">
            <div>
              <h2>Interview mode</h2>
              <p className="sub" style={{ margin: "0.25rem 0 0" }}>{interviewBlurb}</p>
            </div>
            <div className="spacer" />
            <label className="field" style={{ maxWidth: 130 }}>
              <span>Questions</span>
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[3, 5, 8, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <button className="accent" onClick={startInterview} disabled={starting || loading}>
              {starting ? (
                <>
                  <span className="spin" /> &nbsp;Starting…
                </>
              ) : (
                "Start interview"
              )}
            </button>
          </div>
          {active && (
            <p className="sub">
              Drawing from <strong>{categories.find((c) => c.key === active)?.label}</strong> only — clear the filter
              below to draw from everything.
            </p>
          )}
        </div>
      )}

      {/* ---- bank ---- */}
      <div className="section-head">
        <h2>Question bank</h2>
        <span className="sub">
          {loading ? "…" : `${shown.length} of ${questions?.length ?? 0}`}
        </span>
      </div>

      {seedable && !empty && (
        <div className="row wrap no-print" style={{ marginBottom: "var(--s3)" }}>
          {(["all", "book", "generated"] as const).map((s) => (
            <button
              key={s}
              className={`chip${source === s ? " blue" : ""}`}
              style={{ cursor: "pointer" }}
              onClick={() => setSource(s)}
            >
              {s === "all" ? "All sources" : s === "book" ? "From the handbook" : "Generated extensions"}
              {s !== "all" && (
                <span className="mono" style={{ opacity: 0.6 }}>
                  {s === "book" ? sourceCounts.book : sourceCounts.generated}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="row wrap no-print" style={{ marginBottom: "var(--s4)" }}>
        <button className={`chip${active === null ? " blue" : ""}`} style={{ cursor: "pointer" }} onClick={() => setActive(null)}>
          All topics
        </button>
        {categories
          .filter((c) => (countsByCategory.get(c.key) ?? 0) > 0 || !seedable)
          .map((c) => (
            <button
              key={c.key}
              className={`chip${active === c.key ? " blue" : ""}`}
              style={{ cursor: "pointer" }}
              onClick={() => setActive(active === c.key ? null : c.key)}
              title={c.blurb}
            >
              {c.label}
              <span className="mono" style={{ opacity: 0.6 }}>{countsByCategory.get(c.key) ?? 0}</span>
            </button>
          ))}
      </div>

      {loading ? (
        <div className="qgrid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="card" key={i}>
              <div className="skel skel-line w-40" />
              <div className="skel skel-line w-80" />
              <div className="skel skel-line w-60" />
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="empty">
          <strong>No questions here yet</strong>
          {empty ? "Load the bank above to get started." : "Try a different filter."}
        </div>
      ) : (
        <div className="qgrid">
          {shown.map((q) => (
            <Link href={`/${section}/q/${q.id}`} key={q.id} className="card interactive qcard">
              <div className="row wrap qtags">
                <span className="chip">{categories.find((c) => c.key === q.category)?.label ?? q.category}</span>
                {q.difficulty === "stretch" && <span className="chip warn">Stretch</span>}
                {q.source === "generated" && <span className="chip accent">Extension</span>}
              </div>
              <p className="qprompt">{q.prompt}</p>
              <span className="qgo">Answer out loud →</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
