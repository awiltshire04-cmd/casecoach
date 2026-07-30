import type { CaseStructured, GenerateTestParams, ReferenceSolution } from "./types";
import { TOGGLES } from "./types";

const DIFF_CAL: Record<string, string> = {
  level3:
    "Level 3: one simple revenue segment, 1-2 debt tranches, round numbers, beginning-of-year interest basis, no PIK. Clean and quick.",
  level4:
    "Level 4 (PF style): two revenue segments with distinct driver builds, revolver + 2 funded tranches (one PIK), days-based working capital, average-balance interest (circular), LIBOR curve with floors, step-up/DTL on the closing balance sheet. Numbers moderately messy.",
  level5:
    "Level 5 (PF style): everything in Level 4 plus the selected structural concepts (add-on, convertible preferred, options). Messier numbers, more moving parts, quirks interact.",
};

export function buildParamsMessages(p: GenerateTestParams, weakConcepts: string[] = []) {
  const conceptDefs = TOGGLES.filter((t) => p.concepts.includes(t.key))
    .map((t) => `- ${t.key}: ${t.desc}`)
    .join("\n");

  const system = [
    "You are a senior PE modelling-test author. You output ONLY the structured parameters of an LBO modelling test as minified JSON matching the schema exactly. No prose, no markdown fences, no comments.",
    "You NEVER compute derived results (EBITDA, equity checks, IRR) — a deterministic solver does that. Your job is a coherent, realistic scenario.",
  ].join(" ");

  const user = `Create the structured parameters for ONE LBO modelling test.

Selected concepts (the case MUST exercise each):
${conceptDefs}

Difficulty: ${DIFF_CAL[p.difficulty]}
Industry: ${p.industry}. Hold: ${p.hold_years} years. Transaction closes 12/31 of the current year.
${weakConcepts.length ? `The candidate has recently struggled with: ${weakConcepts.join(", ")} — make at least one of these a live, non-trivial mechanic.` : ""}

Schema (TypeScript-ish; every field required unless marked optional; omit optional blocks for concepts NOT selected):
{
 "company": string, "industry": string, "transaction_year": number, "hold_years": ${p.hold_years},
 "segments": [ one of:
   {"kind":"units_price","name":s,"units0_mm":n,"price0":n,"unit_growth":dec,"price_growth":dec,"cogs_pct":dec}
   {"kind":"groups","name":s,"groups0":n,"groups_added_per_year":n,"rev_per_group0_mm":n,"rev_per_group_growth":dec,"cogs_pct":dec,"cost_per_group_mm":n}
   {"kind":"simple","name":s,"rev0_mm":n,"growth":dec,"gross_margin_pct":dec} ],
 "costs": {"sga_pct":dec,"rd_pct":dec,"da_pct_rev":dec,"capex_pct_rev":dec},
 "nwc": {"mode":"days","ar_days":n,"inv_days":n,"ap_days":n,"prepaid_pct":dec,"accrued_pct":dec} OR {"mode":"pct_rev","inc_nwc_pct_rev":dec},
 "bs0": {"cash":n,"ppe":n,"goodwill":n,"existing_debt":n,"shareholder_equity":n},
 "stepup": {"intangible_pct_of_stepup":dec,"intangible_amort_years":n,"dtl_matches":bool},
 "entry": {"ltm_multiple":n,"exit_multiple":n,"min_cash":n,"transaction_expenses":n,"tax_rate":dec,"interest_on_cash":dec,"fin_fee_amort_years":n,"interest_basis":"average"|"beginning"},
 "libor_curve": [dec × ${p.hold_years}],
 "tranches": [{"name":s,"kind":"revolver"|"term"|"notes"|"pik","size_turns":n(omit for revolver),"commitment_mm":n(revolver only),"rate_mode":"floating"|"fixed","spread":dec?,"floor":dec?,"fixed_rate":dec?,"fin_fee_pct":dec,"is_pik":bool,"sweep_priority":n(0=never swept; PIK must be 0)}],
 "recap": {"year":n,"target_total_turns":n,"spread":dec,"floor":dec,"sweep_priority":1} (only if recap selected),
 "addon": {"year":n,"multiple_on_prior_ebitda":n,"customers0_k":n,"customers_added_k":n,"rev_per_customer_k":n,"gm_pct":dec,"sga_pct":dec,"rd_pct":dec} (only if addon selected),
 "convertible": {"amount":n,"pik_rate":dec,"conversion_price":n,"entry_share_price":n} (only if convertible_preferred selected),
 "mgmt_options": {"options_mm":n,"strike":n} (only if mgmt_options selected; strike should equal convertible entry_share_price when both present),
 "quirks": [{"id":"q1","title":short,"mechanic":one-sentence description of the non-standard mechanic,"param_refs":[field paths]}],
 "conventions": []
}

Constraints: total funded leverage 4.0-6.5 turns across tranches; entry multiple 7-13x; exit within ±1.5x of entry; growth rates 2-8%; the deal should produce a plausible PE outcome (not guaranteed home run). quirks: one entry per selected concept that creates a non-standard mechanic (e.g. PIK seniority, OID accretion, recap timing, conversion election) — these drive the case's difficulty. Leave "conventions" as an empty array (filled downstream).

Return the JSON object only.`;
  return { system, user };
}

// Conventions are stated deterministically so the candidate's model can match the key.
export function buildConventions(c: CaseStructured): string[] {
  const conv: string[] = [
    "Interest is calculated on " + (c.entry.interest_basis === "average" ? "average balances (enable iterative calculation)" : "beginning-of-year balances"),
    "Taxes = tax rate × pre-tax income (no NOLs). The DTL amortizes on the balance sheet only",
    "Financing fees are capitalized and amortized straight-line over " + c.entry.fin_fee_amort_years + " years; transaction expenses are a use of funds at close",
    "Closing cash = minimum cash; excess balance-sheet cash is a source of funds",
    "Existing goodwill is written off; new goodwill is the balancing plug on the closing balance sheet",
    "Cash sweep applies 100% of cash above minimum, revolver first, then by stated seniority; PIK tranches are never cash-swept",
  ];
  if (c.tranches.some((t) => (t.oid_pct ?? 0) > 0))
    conv.push("OID: debt is carried at face; the discount is a contra asset accreted straight-line through interest expense over the hold");
  if (c.recap) conv.push("Recap debt is raised at the beginning of the stated year and the full proceeds are immediately paid as a dividend; recap debt can be swept in the same year; no financing fees on recap debt");
  if (c.addon) conv.push("The add-on closes at the very beginning of the stated year at the stated multiple of its prior-year EBITDA, funded by revolver draw then excess cash; it contributes no D&A, capex, or NWC");
  if (c.convertible) conv.push("The convertible preferred PIKs annually and elects the greater of accrued value or as-converted value at exit; options are net-settled (treasury method)");
  return conv;
}

export function buildRenderMessages(c: CaseStructured, sol: ReferenceSolution, mode: "direct" | "cim") {
  const system =
    mode === "direct"
      ? "You are formatting an LBO modelling test as clean assumption sheets (Peak Frameworks style). Return ONLY minified JSON. Every number in the params MUST appear accurately; invent nothing numerical."
      : "You are writing a realistic mock CIM (Confidential Information Memorandum). Return ONLY minified JSON. Every modelling assumption MUST appear somewhere in the document, embedded in narrative the way real CIMs bury numbers — inside paragraphs, footnotes, and tables, NOT as a clean assumptions list. Invent qualitative color freely (management bios, market context) but never alter or add numbers that affect the model.";

  const structural = JSON.stringify({ ...c, quirks: undefined, conventions: undefined });
  const user = `CASE PARAMETERS (ground truth — reproduce all numeric assumptions faithfully):
${structural}

${mode === "direct"
      ? `Produce 3-5 pages: (1) Company & transaction assumptions, (2) Driver assumptions per segment, (3) Debt assumptions, (4) balance sheet / working capital assumptions${c.addon || c.convertible ? ", (5) structural assumptions (add-on / convertible / options)" : ""}. Bullet style, precise.`
      : `Produce 6-8 CIM pages: Executive Summary, Business Overview (segments with the driver numbers woven into prose), Management Team (invented bios), Market & Competition, Historical & Projected Financial Highlights (the operating assumptions embedded), Transaction Overview (debt terms, fees, structure buried in prose and a footnoted table)${c.addon ? ", Acquisition Pipeline (the add-on)" : ""}${c.convertible ? ", Proposed Investment Structure (the convertible terms)" : ""}. The candidate must hunt for the numbers.`}

The modelling task: acquire the company at close, hold ${c.hold_years} years, answer IRR and MoM${c.convertible ? " for the preferred investment (and be ready to discuss the conversion election)" : ""}.

Return JSON exactly: {"pages":[{"title":string,"body":string(markdown)}]}`;
  return { system, user };
}

export function buildHintMessages(c: CaseStructured, sol: ReferenceSolution, quirkId: string) {
  const quirk = c.quirks.find((q) => q.id === quirkId);
  const system =
    "You are a modelling coach giving a case-specific hint. Explain how to model THIS quirk with THIS case's actual numbers — reference exact figures. 4-8 sentences, plain prose. Do not reveal final IRR/MoM. Return plain text only.";
  const user = `CASE PARAMS: ${JSON.stringify(c)}
KEY REFERENCE FIGURES (do not reveal returns): entry EBITDA ${sol.entry.entry_ebitda}, total debt at close ${sol.entry.total_debt}, financing fees ${sol.entry.fin_fees}${sol.entry.oid_proceeds_discount ? ", OID discount " + sol.entry.oid_proceeds_discount : ""}.
QUIRK: ${quirk?.title} — ${quirk?.mechanic}
Explain exactly how to build this mechanic in the model (which line items, what flows where, first-year worked numbers where possible).`;
  return { system, user };
}

export function buildFormulaReviewMessages(args: {
  concepts: string[];
  formulasSample: { sheet: string; cell: string; formula: string }[];
  checkpoints: { label: string; value: number }[];
}) {
  const system =
    "You are reviewing extracted spreadsheet formulas from a candidate's LBO model to judge whether each selected concept is mechanically implemented. Be strict: a hardcoded value where a mechanic should live is 'incorrect'; a partially-wired mechanic is 'partial'; absence is 'not_found'. Return ONLY minified JSON.";
  const user = `Concepts to verify: ${args.concepts.join(", ")}

Formula sample from the workbook (sheet!cell: formula):
${args.formulasSample.map((f) => `${f.sheet}!${f.cell}: ${f.formula}`).join("\n").slice(0, 12000)}

Reference outputs for context: ${args.checkpoints.map((c) => `${c.label}=${c.value}`).join(", ")}

For each concept return a verdict and a one-sentence note citing specific cells where possible.
Return JSON exactly: {"concepts":[{"key":string,"verdict":"correct"|"partial"|"incorrect"|"not_found","note":string}]}`;
  return { system, user };
}

export function buildWriteupMessages(args: {
  writeup: string;
  sol: ReferenceSolution;
  concepts: string[];
}) {
  const s = args.sol;
  const system =
    "You are grading the investment write-up attached to an LBO modelling test. Weighting: numerical conclusions 50% (does their stated return profile match the reference; are their 'key risks' the actual dominant sensitivities), deal judgment 30%, communication 20%. Grade each 0-100, calibrated (most answers 55-80). Return ONLY minified JSON.";
  const user = `REFERENCE SOLUTION:
Returns: ${s.returns.primary_label} IRR ${(s.returns.irr * 100).toFixed(1)}%, MoM ${s.returns.mom}x${s.returns.sponsor_irr != null ? `; sponsor common IRR ${(s.returns.sponsor_irr * 100).toFixed(1)}%` : ""}
Sensitivity by exit multiple: ${s.sensitivity.by_exit_multiple.map((x) => `${x.multiple}x→${(x.irr * 100).toFixed(1)}%`).join(", ")}
Sensitivity by exit year: ${s.sensitivity.by_exit_year.map((x) => `yr${x.year}→${(x.irr * 100).toFixed(1)}%`).join(", ")}
Exit: EBITDA ${s.exit.exit_ebitda}, EV ${s.exit.exit_ev}, net debt ${s.exit.net_debt}, equity ${s.exit.equity_value}${s.exit.preferred_takes ? `; preferred takes ${s.exit.preferred_takes}` : ""}
Concepts in play: ${args.concepts.join(", ")}

CANDIDATE WRITE-UP:
"""
${args.writeup}
"""

Return JSON exactly: {"dimension_scores":{"numerical":int,"judgment":int,"comms":int},"feedback":{"numerical":string,"judgment":string,"comms":string}}`;
  return { system, user };
}
