"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";

// Top bar built around the app's sections rather than one flat list of tools.
// Case-prep tools group under a single menu so Behavioral and Technical read as
// peers of Case Prep, not as siblings of "Paper LBO".
const NAV: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/behavioral", label: "Behavioral" },
  { href: "/technical", label: "Technical" },
];

const CASE_PREP: { href: string; label: string; desc: string }[] = [
  { href: "/cases", label: "Case Practice", desc: "Generate and attempt a timed case" },
  { href: "/cases/review", label: "Review Sheet", desc: "Every takeaway you've collected" },
  { href: "/drill", label: "Paper LBO", desc: "Four-minute returns drills" },
  { href: "/modeltest", label: "Model Test", desc: "Timed LBO modelling in Excel" },
  { href: "/concepts", label: "Concepts", desc: "Reference for modelling mechanics" },
];

export function Nav() {
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);

  const caseActive = CASE_PREP.some((c) => path.startsWith(c.href)) || path.startsWith("/practice");

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (groupRef.current && !groupRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Any navigation closes both menus.
  useEffect(() => {
    setMenuOpen(false);
    setMobileOpen(false);
  }, [path]);

  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <header className="topnav">
      <div className="topnav-inner">
        <Link href="/" className="brand">
          <span className="mark">
            <Logo />
          </span>
          CaseCoach
        </Link>

        <button
          className="navtoggle sm"
          onClick={() => setMobileOpen((o) => !o)}
          aria-expanded={mobileOpen}
          aria-label="Toggle navigation"
        >
          Menu
        </button>

        <nav className={mobileOpen ? "open" : ""}>
          {NAV.map((t) => (
            <Link key={t.href} href={t.href} className={`tab${isActive(t.href) ? " active" : ""}`}>
              {t.label}
            </Link>
          ))}

          <div className={`navgroup${menuOpen ? " open" : ""}`} ref={groupRef}>
            <button
              className={`tab${caseActive ? " active" : ""}`}
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="true"
            >
              Case Prep <span className="caret">▼</span>
            </button>
            {menuOpen && (
              <div className="navmenu" role="menu">
                {/* exact match: /cases and /cases/review are siblings, not parent and child */}
                {CASE_PREP.map((c) => (
                  <Link key={c.href} href={c.href} className={path === c.href ? "active" : ""} role="menuitem">
                    {c.label}
                    <span className="d">{c.desc}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link href="/archive" className={`tab${isActive("/archive") ? " active" : ""}`}>
            Archive
          </Link>
        </nav>
      </div>
    </header>
  );
}
