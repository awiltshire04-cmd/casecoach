// Modelling Test Trainer — shared contracts.
// The case is born as structured params (Stage 1), solved deterministically
// (Stage 2), and only then rendered as prose (Stage 3). Grading compares the
// submitted workbook against the Stage-2 reference solution.

// ---------------------------------------------------------------------------
// Toggle registry.
// category: 'basic'  = concepts appearing in Peak Frameworks Level 4/5
//           'advanced' = beyond the PF guides
// phase: 'A' = solver supports it now; 'B' = greyed in UI until built
// ---------------------------------------------------------------------------
export interface ToggleDef {
  key: string;
  label: string;
  category: "basic" | "advanced";
  phase: "A" | "B";
  desc: string;
}

export const TOGGLES: ToggleDef[] = [
  // ---- basic (PF Level 4/5 material), all Phase A ----
  { key: "driver_forecast", label: "Driver-based operating forecast", category: "basic", phase: "A", desc: "Multi-segment revenue builds (units×price, sales groups) with margin structure" },
  { key: "closing_bs", label: "Closing balance sheet adjustments", category: "basic", phase: "A", desc: "Goodwill, intangible step-up, DTL, capitalized financing fees" },
  { key: "revolver_sweep", label: "Revolver + cash sweep", category: "basic", phase: "A", desc: "Commitment, draws to min cash, sweep waterfall by seniority" },
  { key: "multi_tranche", label: "Multiple debt tranches / PIK", category: "basic", phase: "A", desc: "Term, notes, PIK tranches with floors, LIBOR curve, differing terms" },
  { key: "fee_treatment", label: "Transaction fee treatment", category: "basic", phase: "A", desc: "Capitalized financing fees (amortized) vs expensed transaction costs" },
  { key: "nwc_days", label: "Working capital schedule", category: "basic", phase: "A", desc: "Days-based AR / inventory / AP plus %-of-revenue accruals" },
  { key: "recap", label: "Debt recap / dividend recap", category: "basic", phase: "A", desc: "Mid-hold releveraging to a target multiple with dividend to sponsor" },
  { key: "addon", label: "Add-on acquisition mid-hold", category: "basic", phase: "A", desc: "Acquire a smaller company mid-hold, funded by revolver + cash" },
  { key: "convertible_preferred", label: "Convertible preferred investment", category: "basic", phase: "A", desc: "PIK-accruing preferred with conversion election at exit (L5 style)" },
  { key: "mgmt_options", label: "Management options / rollover", category: "basic", phase: "A", desc: "Options issued at entry, intrinsic value at exit dilutes common" },
  { key: "circularity", label: "Circularity (avg-balance interest)", category: "basic", phase: "A", desc: "Interest on average balances → interest↔sweep circular; test resolution" },
  // ---- advanced (beyond PF), OID pulled into Phase A ----
  { key: "oid", label: "OID (original issue discount)", category: "advanced", phase: "A", desc: "Debt issued below par; discount accretes through interest expense" },
  { key: "seller_note", label: "Seller note", category: "advanced", phase: "B", desc: "Seller paper with PIK-to-cash-pay conversion" },
  { key: "earnout", label: "Earnout", category: "advanced", phase: "B", desc: "Contingent consideration on performance triggers" },
  { key: "tax_election", label: "Tax step-up / 338(h)(10) election", category: "advanced", phase: "B", desc: "Election mechanics beyond the basic step-up" },
  { key: "minority_interest", label: "Minority / non-controlling interest", category: "advanced", phase: "B", desc: "NCI in the structure and waterfall" },
  { key: "preferred_straight", label: "Straight preferred equity", category: "advanced", phase: "B", desc: "Non-convertible preferred in the stack" },
  { key: "covenants", label: "Covenant testing", category: "advanced", phase: "B", desc: "Leverage / coverage covenants tested through the forecast" },
  { key: "mip_waterfall", label: "MIP / co-invest waterfall", category: "advanced", phase: "B", desc: "Management incentive plan tiers and sponsor co-invest" },
  { key: "qoe", label: "QoE EBITDA adjustments", category: "advanced", phase: "A", desc: "Buried quality-of-earnings adjustments you must find and apply" },
  { key: "capex_split", label: "Maintenance vs growth capex", category: "advanced", phase: "A", desc: "Split capex drivers with different behavior" },
  { key: "mezz_warrants", label: "Mezzanine with warrants", category: "advanced", phase: "A", desc: "Mezz tranche with attached equity warrants" },
  { key: "ddtl", label: "Delayed-draw term loan", category: "advanced", phase: "A", desc: "Committed but undrawn facility with ticking fees" },
  { key: "divestiture", label: "Asset divestiture mid-hold", category: "advanced", phase: "A", desc: "Sell a segment mid-hold; proceeds to debt paydown" },
  { key: "nwc_peg", label: "Working capital peg / true-up", category: "advanced", phase: "A", desc: "Cash-free debt-free NWC adjustment at close" },
];

export const PHASE_A_KEYS = TOGGLES.filter((t) => t.phase === "A").map((t) => t.key);

export type PresentationMode = "direct" | "cim";
export type TestDifficulty = "level3" | "level4" | "level5";

export interface GenerateTestParams {
  concepts: string[];             // toggle keys (Phase A only accepted)
  hold_years: number;             // 3-7
  difficulty: TestDifficulty;
  industry: string;
  presentation: PresentationMode;
}

// ---------------------------------------------------------------------------
// Structured case parameters (Stage 1 output — the ground truth)
// ---------------------------------------------------------------------------
export interface SegmentUnitsPrice {
  kind: "units_price";
  name: string;
  units0_mm: number;         // units in year 0, millions
  price0: number;            // $ per unit
  unit_growth: number;       // decimal
  price_growth: number;
  cogs_pct: number;          // of segment revenue
}
export interface SegmentGroups {
  kind: "groups";
  name: string;
  groups0: number;
  groups_added_per_year: number;
  rev_per_group0_mm: number;
  rev_per_group_growth: number;
  cogs_pct: number;
  cost_per_group_mm: number; // below gross profit
}
export interface SegmentSimple {
  kind: "simple";
  name: string;
  rev0_mm: number;
  growth: number;
  gross_margin_pct: number;  // GM as % of revenue
}
export type Segment = SegmentUnitsPrice | SegmentGroups | SegmentSimple;

export interface Tranche {
  name: string;
  kind: "revolver" | "term" | "notes" | "pik" | "mezz" | "ddtl";
  size_turns?: number;        // × entry EBITDA (ignored for revolver)
  commitment_mm?: number;     // revolver only
  rate_mode: "floating" | "fixed";
  spread?: number;            // over LIBOR, decimal (floating)
  floor?: number;             // LIBOR floor, decimal
  fixed_rate?: number;        // decimal (fixed)
  fin_fee_pct: number;        // financing fee on face, capitalized
  is_pik: boolean;
  sweep_priority: number;     // 1 = swept first; 0 = never swept
  oid_pct?: number;           // e.g. 0.02 → issued at 98
  pik_rate?: number;          // mezz: PIK portion accruing on top of the cash rate
  warrants_pct?: number;      // mezz: % of common-pool equity taken at exit via warrants
  draw_year?: number;         // ddtl: drawn at the beginning of this forecast year
  ticking_fee_pct?: number;   // ddtl: fee on undrawn commitment (interest expense)
}

export interface CaseStructured {
  company: string;
  industry: string;
  transaction_year: number;   // e.g. 2025 close at 12/31
  hold_years: number;
  segments: Segment[];
  costs: { sga_pct: number; rd_pct: number; da_pct_rev: number; capex_pct_rev: number; maint_capex_pct_rev?: number; growth_capex_pct_rev?: number };
  nwc:
    | { mode: "days"; ar_days: number; inv_days: number; ap_days: number; prepaid_pct: number; accrued_pct: number }
    | { mode: "pct_rev"; inc_nwc_pct_rev: number };
  bs0: { cash: number; ppe: number; goodwill: number; existing_debt: number; shareholder_equity: number };
  stepup: { intangible_pct_of_stepup: number; intangible_amort_years: number; dtl_matches: boolean };
  entry: {
    ltm_multiple: number;
    exit_multiple: number;
    min_cash: number;
    transaction_expenses: number; // expensed at close (uses)
    tax_rate: number;
    interest_on_cash: number;     // decimal, 0 if off
    fin_fee_amort_years: number;
    interest_basis: "average" | "beginning"; // average → circular
  };
  libor_curve: number[];        // one per forecast year
  tranches: Tranche[];
  recap?: { year: number; target_total_turns: number; spread: number; floor: number; sweep_priority: number };
  addon?: {
    year: number;               // acquired at BEGINNING of this forecast year
    multiple_on_prior_ebitda: number;
    customers0_k: number; customers_added_k: number; rev_per_customer_k: number;
    gm_pct: number; sga_pct: number; rd_pct: number;
    // no D&A / capex / NWC contribution (L5 convention)
  };
  convertible?: {
    amount: number;             // $mm invested by "us"
    pik_rate: number;
    conversion_price: number;   // $/share
    entry_share_price: number;  // pro-forma issuance price
    common_equity_shares_mm?: number; // computed: common funding / issuance price (filled by solver)
  };
  mgmt_options?: { options_mm: number; strike: number };
  qoe?: { adjustments: { label: string; amount_mm: number }[] }; // items inflating REPORTED EBITDA; adjusted (true) EBITDA comes from the drivers
  nwc_peg?: { peg_mm: number; delivered_mm: number };            // purchase price adjusts by delivered − peg at close
  divestiture?: { year: number; segment_name: string; multiple_on_prior_segment_ebitda: number };
  quirks: { id: string; title: string; mechanic: string; param_refs: string[] }[];
  conventions: string[];        // stated so the candidate's model can match the key
}

// ---------------------------------------------------------------------------
// Reference solution (Stage 2 output)
// ---------------------------------------------------------------------------
export interface YearRow {
  year: number;                 // forecast index 1..N
  revenue: number; ebitda: number; da: number; intangible_amort: number; finfee_amort: number;
  interest_expense: number; interest_income: number; pretax: number; taxes: number; net_income: number;
  capex: number; delta_nwc: number; fcf_before_sweep: number;
  tranche_balances: Record<string, number>;  // end of year
  revolver_draw: number; cash: number;
  dividend: number;             // recap dividend paid this year (to sponsor/common)
  divestiture_proceeds: number; // asset-sale proceeds received this year
  balance_check: number;        // |assets - L&E|, should be ~0
}
export interface ReferenceSolution {
  entry: {
    entry_ebitda: number; entry_ev: number; total_debt: number; fin_fees: number; oid_proceeds_discount: number;
    sponsor_equity: number; convertible_amount: number; other_common: number;
    sources: Record<string, number>; uses: Record<string, number>;
  };
  years: YearRow[];
  exit: {
    exit_year: number; exit_ebitda: number; exit_ev: number; net_debt: number; equity_value: number;
    preferred_accrued?: number; preferred_as_converted?: number; preferred_takes?: "accrued" | "converted";
    options_value?: number; common_value: number;
    share_price?: number;
  };
  returns: {
    // primary = the investor the case asks about (preferred holder if convertible, else sponsor common)
    primary_label: string;
    irr: number; mom: number;
    sponsor_irr?: number; sponsor_mom?: number;
  };
  sensitivity: {
    by_exit_year: { year: number; irr: number; mom: number }[];
    by_exit_multiple: { multiple: number; irr: number; mom: number }[];
  };
  checkpoints: { label: string; value: number; kind: "money" | "mult" | "pct"; tol: number }[];
}

// ---------------------------------------------------------------------------
// Grading shapes
// ---------------------------------------------------------------------------
export interface OutputCheck {
  label: string; expected: number; found: number | null; pass: boolean; kind: string;
  /** Where the auditor found it, e.g. "Returns!D14". Absent on pre-audit attempts. */
  ref?: string | null;
  /** True when `ref` resolves to a real cell — guards against invented citations. */
  ref_valid?: boolean;
  note?: string;
}

export type Verdict = "correct" | "partial" | "incorrect" | "missing";

/** One reviewer observation about how the model is built, tied to real cells. */
export interface ModelFinding {
  area: string;                 // "Debt schedule", "Circularity", "Sign conventions"…
  verdict: Verdict;
  cells: string[];              // sheet!cell citations
  note: string;
  cells_valid?: boolean;        // all citations resolved
}

export interface GradeBreakdown {
  outputs: { checks: OutputCheck[]; score: number };          // located, then compared in code
  structure: {                                                 // deterministic formula analysis
    formula_cells: number; hardcoded_numeric: number; hardcode_ratio: number;
    error_cells: string[]; irr_is_formula: boolean; irr_inputs_are_formulas: boolean;
    iterative_calc_enabled: boolean | null; balance_check_found: boolean;
    score: number; notes: string[];
  };
  concepts: { key: string; verdict: "correct" | "partial" | "incorrect" | "not_found"; note: string }[];
  writeup: { dimension_scores: Record<string, number>; feedback: Record<string, string>; score: number };
  speed: { time_taken_sec: number; benchmark_sec: number; context: string };
  total: number;

  // ---- added by the holistic audit; absent on attempts graded before it ----
  mechanics?: { findings: ModelFinding[]; score: number };
  integrity?: { findings: ModelFinding[]; score: number };
  narrative?: { summary: string; strengths: string[]; fixes: string[] };
  audit_meta?: {
    mode: "full" | "digest";     // whether the whole workbook was sent
    cells: number; formulas: number;
    invalid_citations: number;   // findings pointing at cells that don't exist
    fell_back: boolean;          // audit failed; legacy label-matching was used
  };
}

/** Holistic weighting: building it right counts for more than landing a number
 *  in the right place, which is the opposite of the old cell-checklist. */
export const GRADE_WEIGHTS = {
  outputs: 0.30,
  mechanics: 0.30,
  integrity: 0.15,
  concepts: 0.15,
  writeup: 0.10,
} as const;

export const VERDICT_POINTS: Record<Verdict, number> = {
  correct: 100,
  partial: 60,
  incorrect: 20,
  missing: 0,
};

export const TEST_TIME_BENCH: Record<TestDifficulty, number> = {
  level3: 90 * 60,
  level4: 4 * 60 * 60,
  level5: 4 * 60 * 60,
};

export const WRITEUP_DIMENSIONS = [
  { key: "numerical", label: "Numerical conclusions", weight: 50 },
  { key: "judgment", label: "Deal judgment", weight: 30 },
  { key: "comms", label: "Communication", weight: 20 },
];
