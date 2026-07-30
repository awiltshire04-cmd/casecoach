"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", idx: "01", label: "Library" },
  { href: "/practice", idx: "02", label: "Practice" },
  { href: "/drill", idx: "03", label: "Paper LBO" },
  { href: "/archive", idx: "04", label: "Archive" },
  { href: "/modeltest", idx: "05", label: "Model Test" },
];

export function Rail() {
  const path = usePathname();
  return (
    <aside className="rail">
      <div className="brand">
        CaseCoach <span className="tick">▹</span>
      </div>
      <div className="tagline">TIMED CASE REPS</div>
      <nav>
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className={`tab${active ? " active" : ""}`}>
              <span className="idx">{t.idx}</span>
              {t.label}
            </Link>
          );
        })}
      </nav>
      <div className="rail-foot">v0.1 · single-user</div>
    </aside>
  );
}
