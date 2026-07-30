"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Library" },
  { href: "/practice", label: "Practice" },
  { href: "/drill", label: "Paper LBO" },
  { href: "/modeltest", label: "Model Test" },
  { href: "/concepts", label: "Concepts" },
  { href: "/archive", label: "Archive" },
];

export function Rail() {
  const path = usePathname();
  return (
    <header className="topnav">
      <div className="topnav-inner">
        <div className="brand">
          <span className="dot" /> CaseCoach
        </div>
        <nav>
          {TABS.map((t) => {
            const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
            return (
              <Link key={t.href} href={t.href} className={`tab${active ? " active" : ""}`}>
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
