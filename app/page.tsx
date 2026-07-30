"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { setActiveCase } from "@/lib/session";
import {
  CASE_TYPES,
  INDUSTRIES,
  FIRM_FLAVORS,
  type CaseRow,
  type CaseType,
  type Difficulty,
  type Length,
} from "@/lib/types";

type Filters = {
  type: CaseType;
  length: Length;
  has_financials: boolean;
  industry: string;
  difficulty: Difficulty;
  firm_flavor: string;
};

const LENGTHS: Length[] = ["short", "medium", "long"];
const DIFFS: Difficulty[] = ["easy", "medium", "hard"];

export default function LibraryPage() {
  const router = useRouter();
  const [f, setF] = useState<Filters>({
    type: "lbo",
    length: "medium",
    has_financials: true,
    industry: INDUSTRIES[0],
    difficulty: "medium",
    firm_flavor: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [library, setLibrary] = useState<CaseRow[]>([]);
  const [loadingLib, setLoadingLib] = useState(true);

  async function loadLibrary() {
    setLoadingLib(true);
    try {
      const supa = browserClient();
      const { data } = await supa.from("cases").select("*").order("created_at", { ascending: false }).limit(50);
      setLibrary((data as CaseRow[]) ?? []);
    } catch {
      /* env not set yet — leave empty */
    } finally {
      setLoadingLib(false);
    }
  }
  useEffect(() => {
    loadLibrary();
  }, []);

  function randomize() {
    // respect active filters; randomize only the axes the user hasn't "locked" by intent.
    // here we randomize type, industry, difficulty, length within current selection space.
    const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
    setF((prev) => ({
      ...prev,
      type: pick(CASE_TYPES).value,
      industry: pick(INDUSTRIES),
      difficulty: pick(DIFFS),
      length: pick(LENGTHS),
    }));
  }

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/generate-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, firm_flavor: f.firm_flavor || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generation failed");
      setActiveCase(json.case as CaseRow);
      router.push("/practice");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  function attempt(c: CaseRow) {
    setActiveCase(c);
    router.push("/practice");
  }

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">01 · Library</div>
        <h1>Set up a case</h1>
        <p className="sub">Generate a fresh case on demand — it&apos;s saved to your library so you can re-attempt and compare.</p>
      </div>

      <div className="card stack">
        <div className="filters">
          <label className="field">
            <span>Case type</span>
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as CaseType })}>
              {CASE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Industry</span>
            <select value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })}>
              <option value="Random">Random</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Difficulty</span>
            <select value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value as Difficulty })}>
              {DIFFS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Length</span>
            <select value={f.length} onChange={(e) => setF({ ...f, length: e.target.value as Length })}>
              {LENGTHS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Financials / exhibits</span>
            <select
              value={f.has_financials ? "yes" : "no"}
              onChange={(e) => setF({ ...f, has_financials: e.target.value === "yes" })}
            >
              <option value="yes">Included</option>
              <option value="no">None</option>
            </select>
          </label>
          <label className="field">
            <span>Firm flavor</span>
            <select value={f.firm_flavor} onChange={(e) => setF({ ...f, firm_flavor: e.target.value })}>
              <option value="">Generic</option>
              {FIRM_FLAVORS.map((ff) => (
                <option key={ff.value} value={ff.value}>
                  {ff.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row">
          <button className="primary" onClick={generate} disabled={busy}>
            {busy ? (
              <>
                <span className="spin" /> &nbsp;Generating…
              </>
            ) : (
              "Generate & Start"
            )}
          </button>
          <button onClick={randomize} disabled={busy}>
            Randomize
          </button>
          <div className="spacer" />
          {f.firm_flavor && (
            <span className="chip blue">{FIRM_FLAVORS.find((x) => x.value === f.firm_flavor)?.note}</span>
          )}
        </div>
        {err && <p style={{ color: "var(--bad)", fontSize: "0.85rem", margin: 0 }}>{err}</p>}
      </div>

      <div className="page-head" style={{ marginTop: "2rem" }}>
        <h2>Your library</h2>
        <p className="sub">Re-attempt any saved case to compare scores over time.</p>
      </div>

      {loadingLib ? (
        <div className="empty">
          <span className="spin" /> loading…
        </div>
      ) : library.length === 0 ? (
        <div className="empty">No cases yet. Generate one above to get started.</div>
      ) : (
        <div className="stack">
          {library.map((c) => (
            <div className="card row wrap" key={c.id}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{c.title}</div>
                <div className="row wrap" style={{ marginTop: "0.4rem", gap: "0.35rem" }}>
                  <span className="chip blue">{CASE_TYPES.find((t) => t.value === c.type)?.label ?? c.type}</span>
                  <span className="chip">{c.industry}</span>
                  <span className="chip">{c.difficulty}</span>
                  <span className="chip">{c.length}</span>
                  {c.has_financials && <span className="chip">exhibits</span>}
                  {c.firm_flavor && <span className="chip">{c.firm_flavor}</span>}
                </div>
              </div>
              <div className="spacer" />
              <button onClick={() => attempt(c)}>Attempt</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
