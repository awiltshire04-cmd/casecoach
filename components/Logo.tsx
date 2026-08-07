// CaseCoach mark: three ascending bars (the value-creation bridge every LBO
// page draws) with a filled exit marker above the last one. Geometric, no
// letterforms, and legible at 16px — the shape survives being a favicon.
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <rect x="7" y="18" width="4.5" height="7" rx="1.4" fill="#fff" opacity="0.55" />
      <rect x="13.75" y="14" width="4.5" height="11" rx="1.4" fill="#fff" opacity="0.8" />
      <rect x="20.5" y="10" width="4.5" height="15" rx="1.4" fill="#fff" />
      <circle cx="22.75" cy="6.25" r="2.25" fill="#fff" />
    </svg>
  );
}
