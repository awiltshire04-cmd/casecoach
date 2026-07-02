// Paper LBO drill: deterministic scenario generation + answer computation.
// No AI — the math is exact and checked in code within a tolerance band.

export interface LboScenario {
  company: string;
  entry_ebitda: number;        // $M
  entry_multiple: number;      // x EBITDA
  leverage_turns: number;      // x EBITDA of debt at entry
  ebitda_cagr: number;         // decimal, e.g. 0.08
  hold_years: number;
  exit_multiple: number;       // x EBITDA
  annual_fcf_for_paydown: number; // $M/yr of cumulative debt paydown (simplified: total = this * years)
  paydown_pct_of_ebitda: number;  // shown to user as the driver instead of a raw number
}

export interface LboAnswers {
  entry_ev: number;
  entry_equity: number;        // EV - debt
  exit_ebitda: number;
  exit_ev: number;
  debt_paydown: number;        // cumulative over hold
  exit_debt: number;
  exit_equity: number;
  moic: number;
  irr: number;                 // decimal
}

const COMPANIES = [
  "Meridian Industrial", "Cedar Consumer Co", "Harbor Logistics", "Summit Software",
  "Trailhead Services", "Birchwood Products", "Coastal Distribution", "Stoneridge Health",
];

function round(n: number, dp = 1) {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

export function generateScenario(difficulty: "easy" | "medium" | "hard" = "medium"): LboScenario {
  const rnd = (min: number, max: number, step = 1) => {
    const steps = Math.floor((max - min) / step);
    return min + step * Math.floor(Math.random() * (steps + 1));
  };

  // difficulty scales messiness of the numbers
  const ebitda = difficulty === "easy" ? rnd(40, 100, 10) : rnd(35, 145, 5);
  const entryMult = difficulty === "easy" ? rnd(8, 12, 1) : rnd(7, 14, 0.5);
  const leverage = difficulty === "easy" ? rnd(4, 6, 1) : rnd(4, 6.5, 0.5);
  const cagr = difficulty === "easy" ? rnd(5, 10, 5) / 100 : rnd(3, 12, 1) / 100;
  const years = difficulty === "easy" ? 5 : rnd(3, 6, 1);
  // exit multiple: often compresses slightly vs entry to keep it realistic
  const exitDelta = difficulty === "easy" ? 0 : rnd(-15, 5, 5) / 10; // -1.5x..+0.5x
  const exitMult = Math.max(6, round(entryMult + exitDelta, 1));
  const paydownPct = difficulty === "easy" ? 0.5 : rnd(3, 7, 1) / 10; // % of entry EBITDA/yr to debt

  return {
    company: COMPANIES[Math.floor(Math.random() * COMPANIES.length)],
    entry_ebitda: ebitda,
    entry_multiple: round(entryMult, 1),
    leverage_turns: round(leverage, 1),
    ebitda_cagr: cagr,
    hold_years: years,
    exit_multiple: round(exitMult, 1),
    annual_fcf_for_paydown: round(ebitda * paydownPct, 1),
    paydown_pct_of_ebitda: paydownPct,
  };
}

export function computeAnswers(s: LboScenario): LboAnswers {
  const entry_ev = s.entry_ebitda * s.entry_multiple;
  const entry_debt = s.entry_ebitda * s.leverage_turns;
  const entry_equity = entry_ev - entry_debt;

  const exit_ebitda = s.entry_ebitda * Math.pow(1 + s.ebitda_cagr, s.hold_years);
  const exit_ev = exit_ebitda * s.exit_multiple;

  const debt_paydown = Math.min(s.annual_fcf_for_paydown * s.hold_years, entry_debt);
  const exit_debt = entry_debt - debt_paydown;
  const exit_equity = exit_ev - exit_debt;

  const moic = exit_equity / entry_equity;
  const irr = Math.pow(moic, 1 / s.hold_years) - 1;

  return {
    entry_ev: round(entry_ev, 1),
    entry_equity: round(entry_equity, 1),
    exit_ebitda: round(exit_ebitda, 1),
    exit_ev: round(exit_ev, 1),
    debt_paydown: round(debt_paydown, 1),
    exit_debt: round(exit_debt, 1),
    exit_equity: round(exit_equity, 1),
    moic: round(moic, 2),
    irr: round(irr, 3),
  };
}

// The subset of fields the user must enter (final + key intermediates).
export const CHECKED_FIELDS: { key: keyof LboAnswers; label: string; kind: "money" | "mult" | "pct"; tol: number }[] = [
  { key: "entry_equity", label: "Entry equity ($M)", kind: "money", tol: 0.5 },
  { key: "exit_ev", label: "Exit EV ($M)", kind: "money", tol: 1.0 },
  { key: "debt_paydown", label: "Cumulative debt paydown ($M)", kind: "money", tol: 0.5 },
  { key: "moic", label: "MOIC (x)", kind: "mult", tol: 0.05 },
  { key: "irr", label: "IRR (%)", kind: "pct", tol: 0.5 }, // percentage points
];

export function checkAnswer(
  field: (typeof CHECKED_FIELDS)[number],
  submitted: number,
  truth: LboAnswers
): boolean {
  const correct = truth[field.key];
  if (field.kind === "pct") {
    // submitted is entered as a percentage (e.g. 18.2), truth.irr is decimal
    return Math.abs(submitted - correct * 100) <= field.tol;
  }
  return Math.abs(submitted - correct) <= field.tol;
}
