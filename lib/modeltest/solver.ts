// Deterministic LBO engine. Computes the reference solution from structured
// case params. The LLM never does this arithmetic. Internal balance checks
// throw on failure so a broken case can never reach grading.

import type {
  CaseStructured, ReferenceSolution, YearRow, Segment, Tranche,
} from "./types";

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 10000) / 10000;

// ---- segment revenue / gross profit / below-GP segment costs at year t (0 = LTM) ----
function segmentYear(s: Segment, t: number): { rev: number; gp: number; segCost: number } {
  if (s.kind === "units_price") {
    const rev = s.units0_mm * Math.pow(1 + s.unit_growth, t) * s.price0 * Math.pow(1 + s.price_growth, t);
    return { rev, gp: rev * (1 - s.cogs_pct), segCost: 0 };
  }
  if (s.kind === "groups") {
    const groups = s.groups0 + s.groups_added_per_year * t;
    const rev = groups * s.rev_per_group0_mm * Math.pow(1 + s.rev_per_group_growth, t);
    return { rev, gp: rev * (1 - s.cogs_pct), segCost: groups * s.cost_per_group_mm };
  }
  const rev = s.rev0_mm * Math.pow(1 + s.growth, t);
  return { rev, gp: rev * s.gross_margin_pct, segCost: 0 };
}

function baseYear(c: CaseStructured, t: number) {
  let rev = 0, gp = 0, segCost = 0;
  for (const s of c.segments) {
    const y = segmentYear(s, t);
    rev += y.rev; gp += y.gp; segCost += y.segCost;
  }
  const ebitda = gp - segCost - c.costs.sga_pct * rev - c.costs.rd_pct * rev;
  const cogs = rev - gp;
  return { rev, cogs, ebitda };
}

function addonYear(c: CaseStructured, t: number): { rev: number; ebitda: number } {
  const a = c.addon;
  if (!a || t < a.year) return { rev: 0, ebitda: 0 };
  const customers = a.customers0_k + a.customers_added_k * t;
  const rev = customers * a.rev_per_customer_k; // k customers × $k each = $mm
  const ebitda = rev * (a.gm_pct - a.sga_pct - a.rd_pct);
  return { rev, ebitda };
}
function addonPriorEbitda(c: CaseStructured): number {
  const a = c.addon!;
  const customers = a.customers0_k + a.customers_added_k * (a.year - 1);
  const rev = customers * a.rev_per_customer_k;
  return rev * (a.gm_pct - a.sga_pct - a.rd_pct);
}

function nwcAt(c: CaseStructured, rev: number, cogs: number): { assets: number; liabs: number } {
  if (c.nwc.mode === "days") {
    const ar = (c.nwc.ar_days / 365) * rev;
    const inv = (c.nwc.inv_days / 365) * cogs;
    const prepaid = c.nwc.prepaid_pct * rev;
    const ap = (c.nwc.ap_days / 365) * cogs;
    const accrued = c.nwc.accrued_pct * rev;
    return { assets: ar + inv + prepaid, liabs: ap + accrued };
  }
  return { assets: 0, liabs: 0 }; // pct_rev mode handled as delta directly
}

function irrOf(flows: number[]): number {
  const npv = (r: number) => flows.reduce((a, cf, t) => a + cf / Math.pow(1 + r, t), 0);
  let lo = -0.95, hi = 5;
  if (npv(lo) * npv(hi) > 0) return npv(0) > 0 ? 5 : -0.95;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

interface TrancheState { def: Tranche; balance: number; isRecap?: boolean }
interface ExitCalc {
  exitEbitda: number; exitEV: number; netDebt: number; equityValue: number;
  preferredValue: number; preferredTakes?: "accrued" | "converted";
  accrued?: number; asConverted?: number; optionsValue: number; commonValue: number; sharePrice?: number;
}

export function solve(c: CaseStructured): ReferenceSolution {
  const N = c.hold_years;
  const y0 = baseYear(c, 0);
  const entryEbitda = y0.ebitda;
  if (entryEbitda <= 0) throw new Error("Entry EBITDA non-positive");
  const entryEV = entryEbitda * c.entry.ltm_multiple;
  const equityPurchase = entryEV - (c.bs0.existing_debt - c.bs0.cash);
  if (equityPurchase <= 0) throw new Error("Equity purchase price non-positive");

  const tranches: TrancheState[] = c.tranches
    .filter((t) => t.kind !== "revolver")
    .map((t) => ({ def: t, balance: (t.size_turns ?? 0) * entryEbitda }));
  const revolverDef = c.tranches.find((t) => t.kind === "revolver");
  const revolver: TrancheState | null = revolverDef ? { def: revolverDef, balance: 0 } : null;
  const totalDebtFace = tranches.reduce((a, t) => a + t.balance, 0);
  const finFees = tranches.reduce((a, t) => a + t.balance * t.def.fin_fee_pct, 0);
  const oidDiscount = tranches.reduce((a, t) => a + t.balance * (t.def.oid_pct ?? 0), 0);

  const excessCash = Math.max(0, c.bs0.cash - c.entry.min_cash);
  const uses: Record<string, number> = {
    "Purchase of equity": equityPurchase,
    "Refinance existing debt": c.bs0.existing_debt,
    "Transaction expenses": c.entry.transaction_expenses,
    "Financing fees": finFees,
  };
  const usesTotal = Object.values(uses).reduce((a, b) => a + b, 0);
  const debtProceeds = totalDebtFace - oidDiscount;
  const convertibleAmt = c.convertible?.amount ?? 0;
  const equityNeeded = usesTotal - debtProceeds - excessCash;
  if (equityNeeded <= convertibleAmt && convertibleAmt > 0) throw new Error("Convertible exceeds equity need");
  const otherCommon = Math.max(0, equityNeeded - convertibleAmt);
  const sources: Record<string, number> = Object.fromEntries(tranches.map((t) => [t.def.name, t.balance]));
  if (oidDiscount > 0) sources["(less) OID discount"] = -oidDiscount;
  if (excessCash > 0) sources["Excess balance-sheet cash"] = excessCash;
  if (convertibleAmt > 0) sources["Convertible preferred (us)"] = convertibleAmt;
  sources[convertibleAmt > 0 ? "Common equity (co-investor)" : "Sponsor equity"] = otherCommon;

  const stepUp = Math.max(0, equityPurchase - c.bs0.shareholder_equity);
  const intangibles0 = stepUp * c.stepup.intangible_pct_of_stepup;
  const dtl0 = c.stepup.dtl_matches ? intangibles0 : 0;
  const nwc0 = nwcAt(c, y0.rev, y0.cogs);
  const equity0 = convertibleAmt + otherCommon;
  const goodwill0 =
    nwc0.liabs + totalDebtFace + dtl0 + equity0 -
    (c.entry.min_cash + nwc0.assets + c.bs0.ppe + intangibles0 + finFees + oidDiscount);

  const intangAmortYr = c.stepup.intangible_amort_years > 0 ? intangibles0 / c.stepup.intangible_amort_years : 0;
  const finFeeAmortYr = c.entry.fin_fee_amort_years > 0 ? finFees / c.entry.fin_fee_amort_years : 0;
  const oidAmortYr = N > 0 ? oidDiscount / N : 0;
  const addonPrice = c.addon ? addonPriorEbitda(c) * c.addon.multiple_on_prior_ebitda : 0;

  let cash = c.entry.min_cash;
  let ppe = c.bs0.ppe;
  let intang = intangibles0, dtl = dtl0, finFeesNet = finFees, oidNet = oidDiscount;
  let equityTotal = equity0;
  let prevNwcNet = nwc0.assets - nwc0.liabs;
  const dividends: number[] = [];
  const years: YearRow[] = [];

  for (let t = 1; t <= N; t++) {
    const base = baseYear(c, t);
    const add = addonYear(c, t);
    const revenue = base.rev + add.rev;
    const ebitda = base.ebitda + add.ebitda;
    const da = c.costs.da_pct_rev * base.rev;
    const capex = c.costs.capex_pct_rev * base.rev;
    const nwcNow = nwcAt(c, base.rev, base.cogs);
    const deltaNwc = c.nwc.mode === "days"
      ? (nwcNow.assets - nwcNow.liabs) - prevNwcNet
      : c.nwc.inc_nwc_pct_rev * base.rev;

    const libor = c.libor_curve[Math.min(t - 1, c.libor_curve.length - 1)] ?? 0.02;
    const rateOf = (d: Tranche) =>
      d.rate_mode === "fixed" ? (d.fixed_rate ?? 0) : Math.max(d.floor ?? 0, libor) + (d.spread ?? 0);

    // ---- beginning-of-year events ----
    let dividend = 0;
    let recapProceeds = 0;
    if (c.recap && t === c.recap.year) {
      const prior = baseYear(c, t - 1).ebitda + addonYear(c, t - 1).ebitda;
      const target = c.recap.target_total_turns * prior;
      const current = tranches.reduce((a, x) => a + x.balance, 0) + (revolver?.balance ?? 0);
      const raise = Math.max(0, target - current);
      tranches.push({
        def: {
          name: "Recap Debt", kind: "term", rate_mode: "floating",
          spread: c.recap.spread, floor: c.recap.floor, fin_fee_pct: 0,
          is_pik: false, sweep_priority: c.recap.sweep_priority,
        },
        balance: raise, isRecap: true,
      });
      recapProceeds = raise;
      dividend = raise;
    }
    let addonDraw = 0;
    if (c.addon && t === c.addon.year) {
      const fromCash = Math.min(Math.max(0, cash - c.entry.min_cash), addonPrice);
      addonDraw = addonPrice - fromCash;
      cash -= fromCash;
      if (revolver) revolver.balance += addonDraw;
      else tranches[0].balance += addonDraw; // degenerate fallback
    }

    const begin = tranches.map((x) => x.balance);
    const revolverBegin = revolver?.balance ?? 0;

    // ---- circular year solve ----
    let end = [...begin];
    let revolverEnd = revolverBegin;
    let interestExp = 0, interestInc = 0, taxes = 0, netIncome = 0, fcf = 0;
    let pikAdded: number[] = begin.map(() => 0);
    let cashEnd = cash;

    for (let iter = 0; iter < 60; iter++) {
      const basis = (b0: number, b1: number) =>
        c.entry.interest_basis === "average" ? (b0 + b1) / 2 : b0;
      let ie = 0;
      pikAdded = begin.map(() => 0);
      tranches.forEach((tr, i) => {
        const amt = basis(begin[i], end[i]) * rateOf(tr.def);
        ie += amt;
        if (tr.def.is_pik) pikAdded[i] = amt;
      });
      if (revolver) ie += basis(revolverBegin, revolverEnd) * rateOf(revolver.def);
      if (oidNet > 0) ie += oidAmortYr;
      interestInc = c.entry.interest_on_cash * (c.entry.interest_basis === "average" ? (cash + cashEnd) / 2 : cash);
      const ia = intang > 0 ? intangAmortYr : 0;
      const fa = finFeesNet > 0 ? finFeeAmortYr : 0;
      const pretax = ebitda - da - ia - fa - ie + interestInc;
      taxes = Math.max(0, pretax * c.entry.tax_rate);
      netIncome = pretax - taxes;
      const totalPik = pikAdded.reduce((a, b) => a + b, 0);
      const oa = oidNet > 0 ? oidAmortYr : 0;
      fcf = netIncome + da + ia + fa + oa + totalPik - capex - deltaNwc;

      let avail = cash + fcf - c.entry.min_cash + recapProceeds - dividend;
      let rEnd = revolverBegin;
      if (avail > 0 && rEnd > 0) { const pay = Math.min(avail, rEnd); rEnd -= pay; avail -= pay; }
      const e = begin.map((b, i) => b + pikAdded[i]);
      const order = tranches
        .map((tr, i) => ({ i, p: tr.def.sweep_priority }))
        .filter((x) => x.p > 0)
        .sort((a, b) => a.p - b.p);
      for (const { i } of order) {
        if (avail <= 0) break;
        const pay = Math.min(avail, e[i]);
        e[i] -= pay; avail -= pay;
      }
      const newCashEnd = c.entry.min_cash + Math.max(0, avail);
      const converged =
        Math.abs(newCashEnd - cashEnd) < 1e-7 &&
        Math.abs(rEnd - revolverEnd) < 1e-7 &&
        e.every((v, i) => Math.abs(v - end[i]) < 1e-7);
      end = e; revolverEnd = rEnd; cashEnd = newCashEnd; interestExp = ie;
      if (converged) break;
    }

    tranches.forEach((tr, i) => (tr.balance = end[i]));
    if (revolver) revolver.balance = revolverEnd;
    const iaUsed = intang > 0 ? intangAmortYr : 0;
    const faUsed = finFeesNet > 0 ? finFeeAmortYr : 0;
    if (intang > 0) intang = Math.max(0, intang - intangAmortYr);
    if (dtl > 0) dtl = Math.max(0, dtl - (c.stepup.dtl_matches ? intangAmortYr : 0));
    if (finFeesNet > 0) finFeesNet = Math.max(0, finFeesNet - finFeeAmortYr);
    if (oidNet > 0) oidNet = Math.max(0, oidNet - oidAmortYr);
    ppe = ppe + capex - da;
    equityTotal = equityTotal + netIncome - dividend;
    cash = cashEnd;
    prevNwcNet = prevNwcNet + deltaNwc; // cumulative net NWC position (both modes)
    dividends.push(dividend);

    const addonAsset = c.addon && t >= c.addon.year ? addonPrice : 0;
    const debtNow = tranches.reduce((a, x) => a + x.balance, 0) + (revolver?.balance ?? 0);
    // DTL amortization flows through equity in book terms; our taxes are cash taxes on the
    // stated convention, so add back the DTL release to equity for the balance identity.
    const dtlReleaseCum = dtl0 - dtl;
    const assets = cash + prevNwcNet + ppe + goodwill0 + intang + finFeesNet + oidNet + addonAsset;
    const le = debtNow + dtl + (equityTotal + dtlReleaseCum);
    const balanceCheck = assets - le;

    years.push({
      year: t,
      revenue: r1(revenue), ebitda: r1(ebitda), da: r1(da),
      intangible_amort: r1(iaUsed), finfee_amort: r1(faUsed),
      interest_expense: r1(interestExp), interest_income: r1(interestInc),
      pretax: r1(ebitda - da - iaUsed - faUsed - interestExp + interestInc),
      taxes: r1(taxes), net_income: r1(netIncome),
      capex: r1(capex), delta_nwc: r1(deltaNwc), fcf_before_sweep: r1(fcf),
      tranche_balances: Object.fromEntries([
        ...tranches.map((x) => [x.def.name, r1(x.balance)]),
        ...(revolver ? [["Revolver", r1(revolver.balance)]] : []),
      ]) as Record<string, number>,
      revolver_draw: r1(addonDraw), cash: r1(cash), dividend: r1(dividend),
      balance_check: r2(balanceCheck),
    });

    if (Math.abs(balanceCheck) > 2.0) {
      throw new Error(`Balance sheet failed to tie in year ${t}: off by ${r2(balanceCheck)}mm`);
    }
  }

  // ---- exit + waterfall ----
  const exitAt = (k: number, mult: number): ExitCalc => {
    const yr = years[k - 1];
    const exitEbitda = yr.ebitda;
    const exitEV = exitEbitda * mult;
    const debt = Object.values(yr.tranche_balances).reduce((a, b) => a + b, 0);
    const netDebt = debt - yr.cash;
    const equityValue = exitEV - netDebt;

    let preferredValue = 0, preferredTakes: ExitCalc["preferredTakes"];
    let commonValue = equityValue, optionsValue = 0, sharePrice: number | undefined;
    let accrued: number | undefined, asConverted: number | undefined;

    const opts = c.mgmt_options;
    const conv = c.convertible;
    const treasury = (E: number, sh: number) => {
      if (!opts) return { P: sh > 0 ? E / sh : 0, optVal: 0 };
      const oSh = opts.options_mm;
      const pItm = (E + oSh * opts.strike) / (sh + oSh);
      if (pItm > opts.strike) return { P: pItm, optVal: oSh * (pItm - opts.strike) };
      return { P: sh > 0 ? E / sh : 0, optVal: 0 };
    };

    if (conv) {
      const commonShares = otherCommon / conv.entry_share_price;
      const convShares = conv.amount / conv.conversion_price;
      accrued = conv.amount * Math.pow(1 + conv.pik_rate, k);
      const c1 = treasury(equityValue, commonShares + convShares);
      const convertedVal = convShares * c1.P;
      asConverted = convertedVal;
      if (convertedVal >= accrued) {
        preferredTakes = "converted"; preferredValue = convertedVal;
        optionsValue = c1.optVal; sharePrice = c1.P;
      } else {
        preferredTakes = "accrued"; preferredValue = Math.min(accrued, equityValue);
        const remaining = Math.max(0, equityValue - preferredValue);
        const c2 = treasury(remaining, commonShares);
        optionsValue = c2.optVal; sharePrice = c2.P;
      }
      commonValue = Math.max(0, equityValue - preferredValue - optionsValue);
    } else if (opts) {
      const shares = 100; // notional when no per-share structure exists
      const t = treasury(equityValue, shares);
      optionsValue = t.optVal; sharePrice = t.P;
      commonValue = equityValue - optionsValue;
    }

    return { exitEbitda, exitEV, netDebt, equityValue, preferredValue, preferredTakes, accrued, asConverted, optionsValue, commonValue, sharePrice };
  };

  const sponsorReturns = (k: number, ex: ExitCalc) => {
    const flows: number[] = [-otherCommon];
    for (let i = 1; i <= k; i++) flows.push(dividends[i - 1] ?? 0);
    flows[k] += ex.commonValue;
    const inflows = flows.slice(1).reduce((a, b) => a + b, 0);
    return { irr: irrOf(flows), mom: otherCommon > 0 ? inflows / otherCommon : 0 };
  };
  const primaryReturns = (k: number, mult: number) => {
    const ex = exitAt(k, mult);
    if (c.convertible) {
      const flows: number[] = [-c.convertible.amount];
      for (let i = 1; i < k; i++) flows.push(0);
      flows.push(ex.preferredValue);
      return {
        irr: irrOf(flows),
        mom: ex.preferredValue / c.convertible.amount,
        sponsor: sponsorReturns(k, ex),
      };
    }
    const s = sponsorReturns(k, ex);
    return { irr: s.irr, mom: s.mom, sponsor: undefined };
  };

  const finalExit = exitAt(N, c.entry.exit_multiple);
  const primary = primaryReturns(N, c.entry.exit_multiple);
  const primaryLabel = c.convertible ? "Preferred investor (us)" : "Sponsor common";

  const sensYears: { year: number; irr: number; mom: number }[] = [];
  for (let k = Math.max(2, N - 3); k <= N; k++) {
    const r = primaryReturns(k, c.entry.exit_multiple);
    sensYears.push({ year: k, irr: r3(r.irr), mom: r2(r.mom) });
  }
  const sensMult: { multiple: number; irr: number; mom: number }[] = [];
  for (const dm of [-1, -0.5, 0, 0.5, 1]) {
    const m = c.entry.exit_multiple + dm;
    const r = primaryReturns(N, m);
    sensMult.push({ multiple: r2(m), irr: r3(r.irr), mom: r2(r.mom) });
  }

  const money = (label: string, value: number, tolPct = 0.005, floor = 1): ReferenceSolution["checkpoints"][number] =>
    ({ label, value: r1(value), kind: "money", tol: Math.max(floor, Math.abs(value) * tolPct) });
  const checkpoints: ReferenceSolution["checkpoints"] = [
    { label: "IRR", value: r3(primary.irr), kind: "pct", tol: 0.5 },
    { label: "MoM", value: r2(primary.mom), kind: "mult", tol: 0.05 },
    money("Entry EBITDA", entryEbitda),
    money("Entry Enterprise Value", entryEV),
    money("Total Debt at Close", totalDebtFace),
    money("Exit EBITDA", finalExit.exitEbitda),
    money("Exit Enterprise Value", finalExit.exitEV, 0.0075, 1.5),
    money("Exit Net Debt", finalExit.netDebt, 0.01, 1.5),
    money("Exit Equity Value", finalExit.equityValue, 0.01, 1.5),
    money("Year 1 Revenue", years[0].revenue),
  ];
  if (c.convertible) checkpoints.push(money("Preferred Accrued Value at Exit", finalExit.accrued ?? 0));

  return {
    entry: {
      entry_ebitda: r1(entryEbitda), entry_ev: r1(entryEV), total_debt: r1(totalDebtFace),
      fin_fees: r1(finFees), oid_proceeds_discount: r1(oidDiscount),
      sponsor_equity: r1(otherCommon), convertible_amount: r1(convertibleAmt), other_common: r1(otherCommon),
      sources: Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, r1(v)])),
      uses: Object.fromEntries(Object.entries(uses).map(([k, v]) => [k, r1(v)])),
    },
    years,
    exit: {
      exit_year: N, exit_ebitda: r1(finalExit.exitEbitda), exit_ev: r1(finalExit.exitEV),
      net_debt: r1(finalExit.netDebt), equity_value: r1(finalExit.equityValue),
      preferred_accrued: finalExit.accrued != null ? r1(finalExit.accrued) : undefined,
      preferred_as_converted: finalExit.asConverted != null ? r1(finalExit.asConverted) : undefined,
      preferred_takes: finalExit.preferredTakes,
      options_value: finalExit.optionsValue ? r1(finalExit.optionsValue) : undefined,
      common_value: r1(finalExit.commonValue),
      share_price: finalExit.sharePrice != null ? r2(finalExit.sharePrice) : undefined,
    },
    returns: {
      primary_label: primaryLabel,
      irr: r3(primary.irr), mom: r2(primary.mom),
      sponsor_irr: primary.sponsor ? r3(primary.sponsor.irr) : undefined,
      sponsor_mom: primary.sponsor ? r2(primary.sponsor.mom) : undefined,
    },
    sensitivity: { by_exit_year: sensYears, by_exit_multiple: sensMult },
    checkpoints,
  };
}

// ---------------------------------------------------------------------------
// Validation + clamping of LLM-generated params before solving.
// ---------------------------------------------------------------------------
export function validateAndClamp(c: CaseStructured): CaseStructured {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number(v) || lo));
  c.hold_years = Math.round(clamp(c.hold_years, 3, 7));
  c.entry.ltm_multiple = clamp(c.entry.ltm_multiple, 6, 14);
  c.entry.exit_multiple = clamp(c.entry.exit_multiple, 6, 15);
  c.entry.tax_rate = clamp(c.entry.tax_rate, 0.2, 0.4);
  c.entry.interest_on_cash = clamp(c.entry.interest_on_cash ?? 0, 0, 0.03);
  c.entry.fin_fee_amort_years = clamp(c.entry.fin_fee_amort_years || 7, 3, 10);
  c.entry.min_cash = clamp(c.entry.min_cash || 50, 10, 500);
  c.entry.transaction_expenses = clamp(c.entry.transaction_expenses ?? 25, 0, 150);
  if (!Array.isArray(c.libor_curve) || c.libor_curve.length === 0) c.libor_curve = Array(c.hold_years).fill(0.02);
  while (c.libor_curve.length < c.hold_years) c.libor_curve.push(c.libor_curve[c.libor_curve.length - 1]);
  c.libor_curve = c.libor_curve.map((x) => clamp(x, 0.005, 0.06));
  c.stepup.intangible_pct_of_stepup = clamp(c.stepup.intangible_pct_of_stepup ?? 0.1, 0, 0.3);
  c.stepup.intangible_amort_years = clamp(c.stepup.intangible_amort_years || 15, 5, 20);

  const nonRevolver = c.tranches.filter((t) => t.kind !== "revolver");
  if (nonRevolver.length === 0) throw new Error("No funded debt tranches");
  let turns = 0;
  for (const t of c.tranches) {
    t.fin_fee_pct = clamp(t.fin_fee_pct ?? 0.02, 0, 0.03);
    if (t.oid_pct != null) t.oid_pct = clamp(t.oid_pct, 0, 0.04);
    if (t.rate_mode === "floating") {
      t.spread = clamp(t.spread ?? 0.04, 0.02, 0.08);
      t.floor = clamp(t.floor ?? 0.01, 0, 0.02);
    } else {
      t.fixed_rate = clamp(t.fixed_rate ?? 0.07, 0.04, 0.12);
    }
    if (t.kind !== "revolver") {
      t.size_turns = clamp(t.size_turns ?? 2, 0.5, 6);
      turns += t.size_turns;
      if (t.is_pik) t.sweep_priority = 0;
    } else {
      t.commitment_mm = clamp(t.commitment_mm ?? 300, 100, 2000);
      t.is_pik = false;
    }
  }
  if (turns > 6.5) {
    const scale = 6.5 / turns;
    nonRevolver.forEach((t) => (t.size_turns = (t.size_turns ?? 0) * scale));
  }
  if (c.recap) {
    c.recap.year = Math.round(clamp(c.recap.year, 2, Math.max(2, c.hold_years - 1)));
    c.recap.target_total_turns = clamp(c.recap.target_total_turns, 3, 7);
    c.recap.spread = clamp(c.recap.spread ?? 0.04, 0.02, 0.08);
    c.recap.floor = clamp(c.recap.floor ?? 0.01, 0, 0.02);
    c.recap.sweep_priority = Math.round(clamp(c.recap.sweep_priority ?? 1, 1, 5));
  }
  if (c.addon) {
    c.addon.year = Math.round(clamp(c.addon.year, 2, Math.max(2, c.hold_years - 1)));
    c.addon.multiple_on_prior_ebitda = clamp(c.addon.multiple_on_prior_ebitda, 5, 12);
    c.addon.gm_pct = clamp(c.addon.gm_pct, 0.4, 0.9);
    c.addon.sga_pct = clamp(c.addon.sga_pct, 0.05, 0.2);
    c.addon.rd_pct = clamp(c.addon.rd_pct, 0, 0.2);
  }
  if (c.convertible) {
    c.convertible.pik_rate = clamp(c.convertible.pik_rate, 0.04, 0.12);
    c.convertible.conversion_price = clamp(c.convertible.conversion_price || 12, 5, 50);
    c.convertible.entry_share_price = clamp(c.convertible.entry_share_price || c.convertible.conversion_price, 5, 50);
    c.convertible.amount = clamp(c.convertible.amount, 100, 2000);
  }
  if (c.mgmt_options) {
    c.mgmt_options.options_mm = clamp(c.mgmt_options.options_mm, 1, 40);
    c.mgmt_options.strike = clamp(c.mgmt_options.strike || 12, 1, 50);
  }
  if (!c.bs0.shareholder_equity || c.bs0.shareholder_equity <= 0) c.bs0.shareholder_equity = Math.max(200, c.bs0.ppe * 0.5);
  return c;
}
