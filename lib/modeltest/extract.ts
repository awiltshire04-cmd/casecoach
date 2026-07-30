// Workbook extraction + static analysis (grading options A + B).
// A: label-matched checkpoint values vs the reference key.
// B: formula-level hygiene and mechanics — no recalculation, so this reads
//    cached values and formula strings exactly as Excel saved them.

import * as XLSX from "xlsx";
import { unzipSync, strFromU8 } from "fflate";
import type { ReferenceSolution, OutputCheck } from "./types";

interface CellRec { sheet: string; addr: string; r: number; c: number; t: string; v: unknown; f?: string }

export interface ParsedWorkbook {
  cells: CellRec[];
  sheets: string[];
  iterativeCalc: boolean | null;
}

export function parseWorkbook(buf: Buffer): ParsedWorkbook {
  const wb = XLSX.read(buf, { type: "buffer", cellFormula: true, cellNF: false });
  const cells: CellRec[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const ref = ws["!ref"];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[addr] as { t?: string; v?: unknown; f?: string } | undefined;
        if (!cell || (cell.v == null && !cell.f)) continue;
        cells.push({ sheet: name, addr, r: R, c: C, t: cell.t ?? "?", v: cell.v, f: cell.f });
      }
    }
  }
  // iterative-calc flag lives in xl/workbook.xml <calcPr ... iterate="1">
  let iterativeCalc: boolean | null = null;
  try {
    const files = unzipSync(new Uint8Array(buf));
    const wbXml = files["xl/workbook.xml"];
    if (wbXml) {
      const xml = strFromU8(wbXml);
      const m = xml.match(/<calcPr[^>]*>/);
      iterativeCalc = m ? /iterate="(1|true)"/.test(m[0]) : false;
    }
  } catch {
    iterativeCalc = null;
  }
  return { cells, sheets: wb.SheetNames, iterativeCalc };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

// ---- A: checkpoint value extraction by label match --------------------------
export function extractCheckpoints(pw: ParsedWorkbook, sol: ReferenceSolution): OutputCheck[] {
  const labelCells = pw.cells.filter((c) => typeof c.v === "string" && (c.v as string).length < 60);
  const byRowSheet = new Map<string, CellRec[]>();
  for (const c of pw.cells) {
    const k = `${c.sheet}:${c.r}`;
    if (!byRowSheet.has(k)) byRowSheet.set(k, []);
    byRowSheet.get(k)!.push(c);
  }

  return sol.checkpoints.map((cp) => {
    const target = norm(cp.label);
    // exact-normalized match first, then contains
    const candidates = [
      ...labelCells.filter((c) => norm(c.v as string) === target),
      ...labelCells.filter((c) => norm(c.v as string).includes(target) && norm(c.v as string) !== target),
    ];
    let found: number | null = null;
    for (const lc of candidates) {
      const rowCells = (byRowSheet.get(`${lc.sheet}:${lc.r}`) ?? [])
        .filter((c) => c.c > lc.c && c.c <= lc.c + 6 && typeof c.v === "number")
        .sort((a, b) => a.c - b.c);
      if (rowCells.length) { found = rowCells[0].v as number; break; }
    }
    if (found != null && cp.kind === "pct" && Math.abs(found) <= 1) found = found * 100;
    if (found != null && cp.kind === "pct" && Math.abs(cp.value) <= 1) {
      // reference stored as decimal — compare in percentage points
    }
    const expected = cp.kind === "pct" ? cp.value * 100 : cp.value;
    const pass = found != null && Math.abs(found - expected) <= cp.tol;
    return { label: cp.label, expected: Math.round(expected * 100) / 100, found: found != null ? Math.round(found * 100) / 100 : null, pass, kind: cp.kind };
  });
}

// ---- B: static structure / hygiene analysis --------------------------------
export interface StaticAnalysis {
  formula_cells: number;
  hardcoded_numeric: number;
  hardcode_ratio: number;
  error_cells: string[];
  irr_is_formula: boolean;
  irr_inputs_are_formulas: boolean;
  iterative_calc_enabled: boolean | null;
  balance_check_found: boolean;
  notes: string[];
}

export function staticAnalysis(pw: ParsedWorkbook): StaticAnalysis {
  let formulaCells = 0, hardNumeric = 0;
  const errorCells: string[] = [];
  for (const c of pw.cells) {
    if (c.f) formulaCells++;
    else if (typeof c.v === "number") hardNumeric++;
    if (c.t === "e" || (typeof c.v === "string" && /^#(REF|DIV\/0|VALUE|NAME|N\/A|NUM)/.test(c.v as string)))
      errorCells.push(`${c.sheet}!${c.addr}`);
  }
  const ratio = formulaCells + hardNumeric > 0 ? hardNumeric / (formulaCells + hardNumeric) : 1;

  // IRR wiring: find IRR/XIRR formulas and check whether their referenced ranges point at formula cells
  const irrCells = pw.cells.filter((c) => c.f && /X?IRR\s*\(/i.test(c.f!));
  let irrInputsAreFormulas = false;
  if (irrCells.length) {
    const cellIndex = new Map(pw.cells.map((c) => [`${c.sheet}!${c.addr}`, c]));
    outer: for (const irr of irrCells) {
      const rangeM = irr.f!.replace(/\$/g, "").match(/([A-Z]{1,3})(\d+):([A-Z]{1,3})(\d+)/);
      if (!rangeM) continue;
      const [, c1, r1s, c2, r2s] = rangeM;
      const colToNum = (s: string) => s.split("").reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
      const r1 = parseInt(r1s) - 1, r2 = parseInt(r2s) - 1, cc1 = colToNum(c1), cc2 = colToNum(c2);
      let refd = 0, withF = 0;
      for (let R = Math.min(r1, r2); R <= Math.max(r1, r2); R++) {
        for (let C = Math.min(cc1, cc2); C <= Math.max(cc1, cc2); C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = cellIndex.get(`${irr.sheet}!${addr}`);
          if (cell && typeof cell.v === "number") { refd++; if (cell.f) withF++; }
        }
      }
      if (refd > 0 && withF / refd >= 0.5) { irrInputsAreFormulas = true; break outer; }
    }
  }

  const balanceCheckFound = pw.cells.some(
    (c) => typeof c.v === "string" && /(balance\s*)?check|balances\??|a\s*-\s*l\s*&?\s*e/i.test(c.v as string) && (c.v as string).length < 30
  );

  const notes: string[] = [];
  if (ratio > 0.35) notes.push(`Hardcode ratio ${(ratio * 100).toFixed(0)}% is high — a clean test model runs ~20-25% (assumptions only).`);
  if (errorCells.length) notes.push(`${errorCells.length} error cell(s): ${errorCells.slice(0, 5).join(", ")}${errorCells.length > 5 ? "…" : ""}.`);
  if (!irrCells.length) notes.push("No IRR/XIRR formula found — returns appear hardcoded or missing.");
  else if (!irrInputsAreFormulas) notes.push("IRR formula found but its cash-flow inputs are mostly typed constants, not linked cells.");
  if (!balanceCheckFound) notes.push("No balance check row detected — always carry an A − L&E check.");

  return {
    formula_cells: formulaCells,
    hardcoded_numeric: hardNumeric,
    hardcode_ratio: Math.round(ratio * 1000) / 1000,
    error_cells: errorCells.slice(0, 20),
    irr_is_formula: irrCells.length > 0,
    irr_inputs_are_formulas: irrInputsAreFormulas,
    iterative_calc_enabled: pw.iterativeCalc,
    balance_check_found: balanceCheckFound,
    notes,
  };
}

// ---- formula sample for the LLM concept review ------------------------------
const CONCEPT_KEYWORDS: Record<string, RegExp> = {
  revolver_sweep: /revolver|sweep|min\s*cash|MIN\(|MAX\(/i,
  multi_tranche: /pik|notes|term|tranche/i,
  fee_treatment: /fee/i,
  nwc_days: /receivable|inventory|payable|prepaid|accrued|days|dso|dio|dpo/i,
  recap: /recap|dividend/i,
  addon: /add[\s-]?on|acquisition|customers/i,
  convertible_preferred: /convert|preferred|accru/i,
  mgmt_options: /option|strike|treasury/i,
  circularity: /average|circ/i,
  oid: /oid|discount/i,
  closing_bs: /goodwill|intangible|step[\s-]?up|dtl|deferred/i,
  driver_forecast: /units|price|growth|segment/i,
};

export function formulaSample(pw: ParsedWorkbook, concepts: string[], cap = 160) {
  const out: { sheet: string; cell: string; formula: string }[] = [];
  const labelRows = new Set<string>();
  for (const c of pw.cells) {
    if (typeof c.v !== "string") continue;
    for (const key of concepts) {
      const re = CONCEPT_KEYWORDS[key];
      if (re && re.test(c.v as string)) labelRows.add(`${c.sheet}:${c.r}`);
    }
  }
  for (const c of pw.cells) {
    if (!c.f) continue;
    const near = labelRows.has(`${c.sheet}:${c.r}`);
    const selfMatch = /X?IRR\(|MIN\(|MAX\(/i.test(c.f);
    if (near || selfMatch) out.push({ sheet: c.sheet, cell: c.addr, formula: c.f.slice(0, 120) });
    if (out.length >= cap) break;
  }
  return out;
}
