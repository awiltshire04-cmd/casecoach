import { TOGGLES } from "@/lib/modeltest/types";
import { HELP_CONTENT } from "@/lib/modeltest/help-content";

export const metadata = { title: "Concepts — CaseCoach" };

function Group({ title, sub, keys }: { title: string; sub: string; keys: string[] }) {
  return (
    <section className="stack">
      <div>
        <h2>{title}</h2>
        <p className="sub">{sub}</p>
      </div>
      <div className="concept-grid">
        {keys.map((key) => {
          const t = TOGGLES.find((x) => x.key === key)!;
          const h = HELP_CONTENT[key];
          if (!h) return null;
          return (
            <article key={key} className="concept-card" id={key}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3>{t.label}</h3>
                {t.phase === "B" && <span className="chip">Coming Soon</span>}
              </div>
              <p className="why">{h.what}</p>
              <p className="why"><strong>Why It Shows Up:</strong> {h.why}</p>
              <strong style={{ fontSize: "0.85rem" }}>How to Build It</strong>
              <ol>
                {h.build.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function ConceptsPage() {
  const basic = TOGGLES.filter((t) => t.category === "basic").map((t) => t.key);
  const advanced = TOGGLES.filter((t) => t.category === "advanced").map((t) => t.key);
  return (
    <div className="stack" style={{ gap: "2.2rem" }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Reference</div>
          <h1>Modelling Concepts</h1>
          <p className="sub">
            Every concept the test generator can throw at you — what it means, why real modelling
            tests use it, and how to build it in Excel. Read before a timed attempt; the in-test
            hints are case-specific, this is the general playbook.
          </p>
        </div>
      </div>
      <Group
        title="Basic — Peak Frameworks Level 4/5 Material"
        sub="The core machinery every full LBO test assumes. Master these before layering the advanced set."
        keys={basic}
      />
      <Group
        title="Advanced — Beyond the PF Guides"
        sub="Structural mechanics from live deal processes. Toggles marked Coming Soon are documented here ahead of solver support."
        keys={advanced}
      />
    </div>
  );
}
