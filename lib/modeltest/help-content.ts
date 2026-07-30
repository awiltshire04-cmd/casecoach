// Static reference content for the Concepts page. One entry per toggle key.
// Written to stand alone before a test — generic build steps, not case-specific.

export interface ConceptHelp {
  what: string;
  why: string;
  build: string[];
}

export const HELP_CONTENT: Record<string, ConceptHelp> = {
  driver_forecast: {
    what: "Revenue built bottom-up from operating drivers (units × price, sales groups × productivity, customers × ARPU) rather than a single growth rate, with margins built line-by-line beneath it.",
    why: "Tests whether you can translate a business description into mechanics — and it's where CIM-style tests hide the numbers you actually need.",
    build: [
      "Lay out one driver block per segment: volume drivers on one row, pricing on the next, revenue = product.",
      "Grow each driver on its own rate — never grow segment revenue directly when drivers are given.",
      "Compute COGS per segment (given as % of that segment's revenue), then consolidate to total gross profit.",
      "Deduct segment-specific costs (e.g. per-group salaries) where instructed — read carefully whether they sit in COGS or below gross profit.",
      "Apply corporate SG&A / R&D / D&A as % of consolidated revenue unless stated otherwise.",
      "Sanity-check year 1 by hand on a calculator before building further — everything downstream inherits an error here.",
    ],
  },
  closing_bs: {
    what: "The post-transaction balance sheet: old equity and refinanced debt come off, new debt and sponsor equity go on, and purchase accounting creates intangible step-up, a matching DTL, capitalized financing fees, and a goodwill plug.",
    why: "It's the canonical test of whether you understand what an LBO actually does to the books — and the amortization schedules it creates feed the P&L for the whole hold.",
    build: [
      "Start from the pre-transaction balance sheet; remove existing debt (refinanced) and old shareholder equity.",
      "Compute step-up = equity purchase price − book equity; intangibles = stated % of step-up; DTL matches intangibles when instructed.",
      "Capitalize financing fees as an asset; expensed transaction costs reduce equity (a use of funds, not an asset).",
      "Add the new debt tranches at face and the sponsor equity contribution.",
      "Plug goodwill so total assets = total liabilities + equity — goodwill is always the balancer, never computed independently.",
      "Set up amortization schedules (intangibles, DTL, financing fees) right away; they run every forecast year.",
    ],
  },
  revolver_sweep: {
    what: "A committed revolving facility that draws when cash would fall below the minimum and repays first from excess cash, plus a sweep that applies surplus cash to the funded debt in seniority order.",
    why: "The revolver-and-sweep block is the beating heart of every LBO model test — the debt schedule is where most candidates break.",
    build: [
      "Compute cash available for debt paydown: net income + non-cash items − capex − ΔNWC, starting from beginning cash above the minimum.",
      "Draw the revolver only if cash would otherwise end below minimum cash; never let it exceed the commitment.",
      "Repay the revolver first from any surplus, then sweep remaining surplus through the funded tranches in the stated seniority order.",
      "Ending cash = minimum cash + whatever survives the sweep (only positive once all sweepable debt is repaid).",
      "Wire each tranche: beginning balance → PIK additions → (sweep payments) → ending balance, with interest on the stated basis.",
      "Check: cash never below minimum, revolver never negative or above commitment, and no tranche balance goes negative.",
    ],
  },
  multi_tranche: {
    what: "A capital structure with several debt instruments — term loan, senior notes, PIK notes — each with its own rate convention (floating with floors vs fixed), amortization, and sweep treatment.",
    why: "Real structures are layered; tests use multiple tranches to see whether you keep the mechanics straight when there are four schedules instead of one.",
    build: [
      "One schedule block per tranche, stacked: beginning balance, interest, PIK accrual, sweep repayment, ending balance.",
      "Floating tranches: rate = MAX(LIBOR curve for that year, floor) + spread. Fixed tranches: the stated coupon.",
      "PIK tranches: interest hits the P&L but adds to the balance instead of consuming cash — add it back in cash flow.",
      "Respect sweep order strictly; PIK paper is typically never swept.",
      "Total interest expense = sum across all tranches (plus revolver and any commitment fees).",
      "Keep a total-debt roll-forward row — you'll need it for net debt at exit and for leverage checks.",
    ],
  },
  fee_treatment: {
    what: "The split between financing fees (capitalized on the balance sheet, amortized over the facility life) and transaction expenses (expensed / a use of funds at close).",
    why: "A small mechanic that's pure signal: candidates who expense financing fees or capitalize advisory fees reveal they've memorized outputs, not mechanics.",
    build: [
      "In sources & uses, list financing fees (% of each fee-bearing tranche's face) and transaction expenses as separate uses.",
      "Capitalize financing fees as an asset on the closing balance sheet; transaction expenses just consume funding.",
      "Amortize financing fees straight-line over the stated life; the amortization is non-cash — add it back in cash flow.",
      "Where the test asks for interest expense 'including amortization of fees', include it there rather than in D&A; state your placement either way.",
    ],
  },
  nwc_days: {
    what: "A working capital schedule driven by activity ratios: AR on days sales, inventory and AP on days COGS, prepaid and accrued items as % of revenue.",
    why: "ΔNWC is a real cash flow that most quick models hand-wave; days-based builds test whether you can go from ratios to dollars to cash impact.",
    build: [
      "Compute each account per year: AR = days/365 × revenue; inventory and AP = days/365 × COGS; prepaid/accrued = % of revenue.",
      "Net working capital = current operating assets − current operating liabilities (exclude cash and debt).",
      "Cash impact each year = −(NWC_t − NWC_{t−1}); growth in NWC consumes cash.",
      "Anchor year 0 from the same formulas applied to LTM figures so year 1's delta is meaningful.",
      "Carry the NWC accounts onto the balance sheet — they're part of the balance check.",
    ],
  },
  recap: {
    what: "A mid-hold dividend recapitalization: the company raises new debt up to a target leverage multiple and pays the proceeds straight out to shareholders as a dividend.",
    why: "Tests multi-flow IRR mechanics (money back before exit) and the judgment question that follows: what did releveraging buy you, and what did it cost?",
    build: [
      "At the start of the recap year, size the raise: target turns × prior-year EBITDA − existing total debt.",
      "Add a new tranche for the recap debt with its own rate and sweep priority (often senior in the sweep).",
      "Record proceeds in and an equal dividend out in the financing section — cash-neutral to the company, but the dividend is an equity inflow to the sponsor in that year.",
      "Include the dividend as an interim positive flow in the IRR (use XIRR or a flows row by year — MOIC alone won't show the timing benefit).",
      "Let the sweep start paying the recap debt down immediately if the test allows it.",
    ],
  },
  addon: {
    what: "A bolt-on acquisition closed mid-hold at a multiple of the target's trailing EBITDA, funded by revolver and excess cash, contributing its own revenue and margin profile thereafter.",
    why: "Buy-and-build is the dominant PE playbook; tests use add-ons to check you can merge a second driver build into a running model without breaking the debt schedule.",
    build: [
      "Build the add-on's standalone forecast from its own drivers from day one (you'll need its prior-year EBITDA to price the deal).",
      "Purchase price = stated multiple × add-on EBITDA in the year before close.",
      "At the start of the acquisition year: fund from excess cash above minimum first (or DDTL if provided), draw the revolver for the rest.",
      "Consolidate add-on revenue and EBITDA from the close year onward; respect stated simplifications (e.g. no D&A/capex/NWC contribution).",
      "Check pro-forma leverage right after close — the revolver draw plus new EBITDA changes the credit picture, and write-ups should mention it.",
    ],
  },
  convertible_preferred: {
    what: "A preferred instrument that accrues PIK dividends and can convert into common at a set price — the holder takes the greater of accrued value or as-converted value at exit.",
    why: "Structured equity is everywhere in current vintage deals; the conversion election is a clean test of option-like payoff thinking inside a model.",
    build: [
      "Accrue the preferred at (1 + PIK rate)^years on the invested amount — a simple compounding schedule, not a P&L expense.",
      "Track share counts: common shares from each equity source at the issuance price; conversion shares = investment ÷ conversion price.",
      "At exit, compute both branches: accrued value, and as-converted value = conversion shares × per-share equity value (dilute for the conversion itself).",
      "The preferred takes the maximum; common gets the residual — build both cases and use MAX rather than guessing which wins.",
      "Report the preferred investor's IRR/MoM separately from sponsor common — they're different securities with different returns.",
    ],
  },
  mgmt_options: {
    what: "Options granted to management at close, worth their intrinsic value at exit and diluting the common pool (settled treasury-method).",
    why: "A quick dilution mechanic that tests whether your exit waterfall handles more than one claimant cleanly.",
    build: [
      "Carry the option count and strike; nothing happens on the P&L during the hold.",
      "At exit, test moneyness against the per-share value; if in the money, use the treasury method: P = (equity + options × strike) ÷ (shares + options).",
      "Option value = options × (P − strike); subtract from the common pool before computing sponsor proceeds.",
      "If out of the money, they expire worthless — don't force value into them.",
    ],
  },
  circularity: {
    what: "Interest computed on average debt balances creates a loop: interest → cash flow → sweep → ending balance → average balance → interest.",
    why: "Every serious test with average-balance interest requires you to handle the loop deliberately — either iterative calculation or a clean copy-paste breaker.",
    build: [
      "Enable iterative calculation (File → Options → Formulas → Enable iterative calculation, ~100 iterations) before wiring average-balance interest.",
      "Interest per tranche = rate × (beginning + ending)/2; let Excel iterate to convergence.",
      "Keep a circularity switch (a 0/1 cell that zeroes interest) so you can break the loop to debug #REF cascades.",
      "If you'd rather avoid iteration, compute interest on beginning balances and state the convention — but only when the test allows it.",
      "Watch for the classic failure: a stray error inside the loop propagates everywhere; the switch is how you recover.",
    ],
  },
  oid: {
    what: "Original issue discount: debt issued below par (e.g. at 98), with the discount accreting through interest expense over the life — proceeds are less than face.",
    why: "It separates candidates who think in face amounts from those who track actual cash proceeds and effective cost of debt.",
    build: [
      "Sources: show the tranche at face and the OID as a negative source (proceeds = face × (1 − OID%)).",
      "Carry the unamortized discount (contra-liability or asset, per stated convention) on the balance sheet.",
      "Accrete the discount straight-line (or effective-interest if demanded) through interest expense; it's non-cash — add it back in cash flow.",
      "At exit, debt repays at face; make sure net debt uses face, not proceeds.",
    ],
  },
  seller_note: {
    what: "Deferred consideration owed to the seller, typically PIK-accruing early and converting to cash-pay later, subordinate to the institutional debt.",
    why: "Common in founder deals and a neat test of a tranche whose behavior changes mid-schedule.",
    build: [
      "Model it as a junior tranche: PIK accrual in the stated years, cash coupon thereafter.",
      "Keep it out of the cash sweep unless explicitly included.",
      "Repay at exit from equity-side proceeds ahead of common (read the priority the case states).",
    ],
  },
  earnout: {
    what: "Contingent purchase price paid only if performance triggers are hit.",
    why: "Tests conditional logic and whether you burden the exit-year cash correctly when the trigger fires.",
    build: [
      "Model the trigger test explicitly (e.g. year-N EBITDA vs threshold) with an IF.",
      "If earned, record the payment as a cash outflow (and a use in returns) in the year it pays.",
      "Show both states in your write-up — the earnout's expected cost is a real valuation input.",
    ],
  },
  tax_election: {
    what: "Election mechanics (e.g. 338(h)(10)) that make the step-up tax-deductible, changing cash taxes rather than just book amortization.",
    why: "The step-up's cash value is a genuine negotiation point; modelling it correctly separates tax-aware candidates.",
    build: [
      "When elected, amortize the stepped-up basis for tax purposes — cash taxes fall by rate × amortization.",
      "Track book vs cash taxes separately; the DTL bridges them.",
      "Value the election as the PV of tax savings when the write-up asks whether to pay for it.",
    ],
  },
  minority_interest: {
    what: "A non-controlling stake retained by another owner, entitled to its share of value.",
    why: "Tests whether your waterfall distributes to all claimants, not just the sponsor.",
    build: [
      "Carry NCI on the balance sheet, accreting its share of net income.",
      "At exit, allocate equity value pro-rata (or per the stated terms) before computing sponsor proceeds.",
    ],
  },
  preferred_straight: {
    what: "Non-convertible preferred: a fixed-return instrument senior to common, redeemed at accrued value.",
    why: "The simpler cousin of the convertible — tests waterfall ordering without the election.",
    build: [
      "Accrue at the stated rate (cash or PIK per terms).",
      "Redeem at accrued value at exit ahead of common; no conversion branch.",
    ],
  },
  covenants: {
    what: "Leverage and coverage tests (e.g. net debt/EBITDA, EBITDA/interest) checked each period against thresholds.",
    why: "Credit discipline: tests whether you monitor the model's own outputs, not just build them.",
    build: [
      "Compute each ratio per year from the schedules you already have.",
      "Flag breaches with conditional logic; discuss cushion and the tightest year in the write-up.",
    ],
  },
  mip_waterfall: {
    what: "A management incentive plan paying tiered promote above return hurdles.",
    why: "Waterfall arithmetic under hurdles is a staple of fund-side modelling.",
    build: [
      "Define hurdle tiers on sponsor proceeds or IRR; allocate incremental value by tier.",
      "Build tier-by-tier: value in tier × promote %, cascading the residual.",
      "Reconcile: management + sponsor allocations must sum to total equity value.",
    ],
  },
  qoe: {
    what: "Quality-of-earnings adjustments: one-time gains, owner add-backs, and run-rate credits inflating reported EBITDA — the deal prices off the adjusted (normalized) figure.",
    why: "The highest-yield reading-comprehension trap in real processes: the multiple is only as good as the EBITDA under it.",
    build: [
      "Hunt the document for non-recurring items — footnotes, MD&A asides, the accountant's note; assume nothing clean is handed to you.",
      "Build a bridge: reported EBITDA − one-time gains + verified add-backs = adjusted EBITDA.",
      "Apply the entry multiple to adjusted EBITDA — sources & uses, leverage sizing, and step-up all flow from it.",
      "Forecast off the normalized base, not the reported one; the one-timers don't recur.",
      "State your bridge explicitly in the write-up — it's often the single most valuable sentence in it.",
    ],
  },
  capex_split: {
    what: "Capex separated into maintenance (keeping the current base running) and growth (funding expansion), each with its own driver.",
    why: "The split is how investors think about true free cash flow and what happens to spend if growth stops.",
    build: [
      "Two rows: maintenance capex and growth capex, each on its stated driver (% of revenue or fixed program).",
      "Both are cash out and both add to PP&E; D&A stays on its own driver.",
      "In the write-up, quote FCF on a maintenance-only basis when arguing downside resilience — that's the point of the split.",
    ],
  },
  mezz_warrants: {
    what: "Mezzanine debt paying a cash coupon plus a PIK strip, with attached warrants entitling the lender to a slice of common equity value at exit.",
    why: "Blended debt/equity instruments test whether you can split one instrument's economics across the P&L, the debt schedule, and the waterfall.",
    build: [
      "Debt side: cash coupon on the balance plus PIK accruing to principal — both are interest expense, only the coupon consumes cash.",
      "Keep mezz out of the cash sweep; it repays at exit at accreted principal.",
      "Warrant side: at exit, warrants take the stated % of common equity value (after any preferred) — dilute common before sponsor proceeds.",
      "In returns, note the all-in mezz cost (coupon + PIK + warrant value) if the write-up asks about financing efficiency.",
    ],
  },
  ddtl: {
    what: "A delayed-draw term loan: committed at close, undrawn until a stated trigger (an add-on, an expansion), with a ticking fee on the undrawn commitment.",
    why: "Committed-but-undrawn capital is standard for buy-and-build; the ticking fee and draw timing are easy to forget and easy to grade.",
    build: [
      "Balance is zero until the draw year; charge the ticking fee (% of undrawn commitment) through interest expense each undrawn year.",
      "At the draw: balance up by the commitment, cash funds the stated purpose (add-on purchase or capex program) in the same motion.",
      "From the draw onward it behaves like a term loan — its rate, its sweep priority.",
      "Show the fee separately from coupon interest if the test asks for an interest build.",
    ],
  },
  divestiture: {
    what: "Selling a segment mid-hold at a multiple of its standalone EBITDA; the P&L shrinks and the proceeds delever the company.",
    why: "The mirror image of the add-on: tests removing a business cleanly from a consolidated model.",
    build: [
      "Compute the segment's standalone EBITDA (allocate corporate costs on its revenue) for the year before sale — that's the pricing base.",
      "From the sale year onward, strip the segment's revenue and costs from the forecast entirely.",
      "Proceeds arrive at the start of the sale year and flow into the cash waterfall (paydown), per the stated tax treatment.",
      "Re-check leverage after the sale: less EBITDA but less debt — the ratio can move either way, and the write-up should say which.",
    ],
  },
  nwc_peg: {
    what: "A working-capital true-up at close: purchase price adjusts dollar-for-dollar for delivered NWC versus a negotiated peg.",
    why: "Every real SPA has one; it tests whether you connect diligence mechanics to the equity check.",
    build: [
      "Adjustment = delivered NWC − peg; positive means the buyer pays more (more working capital delivered than promised).",
      "Add the adjustment to the purchase of equity in uses — it flows straight into the sponsor equity check.",
      "Keep the funded debt sizing unaffected (it sizes off EBITDA); the adjustment moves equity, not leverage.",
      "Mention in the write-up when the true-up is large relative to equity — it's a real source of price risk at signing.",
    ],
  },
};
