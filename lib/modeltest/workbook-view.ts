// Renders a parsed workbook into text a reviewer can actually audit: every row,
// in order, with each cell's formula AND its cached value.
//
// Measured on a real Level-5 submission: 886 formulas total 9.7KB (~3k tokens)
// and the full rendered view lands around 15-20k tokens. So the default is full
// fidelity — no chunking, no summarisation, nothing thrown away. The digest
// fallback below exists only for pathological workbooks far larger than
// anything this trainer generates.

import type { ParsedWorkbook } from "./extract";

const MAX_FORMULA_CELLS = 8000;
const MAX_CHARS = 400_000;

function fmtValue(v: unknown): string {
  if (typeof v === "number") {
    // Keep it readable without destroying precision the grader might need.
    const r = Math.abs(v) >= 1000 ? Math.round(v * 10) / 10 : Math.round(v * 10000) / 10000;
    return String(r);
  }
  if (typeof v === "string") return `"${v.replace(/\s+/g, " ").slice(0, 90)}"`;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return "";
}

/** One line per populated row: `R12: A"Revenue" | C{=SUM(...)}=333.4 | D…` */
function renderRows(pw: ParsedWorkbook, sheet: string): string[] {
  const rows = new Map<number, typeof pw.cells>();
  for (const c of pw.cells) {
    if (c.sheet !== sheet) continue;
    if (!rows.has(c.r)) rows.set(c.r, []);
    rows.get(c.r)!.push(c);
  }
  const out: string[] = [];
  for (const r of [...rows.keys()].sort((a, b) => a - b)) {
    const cells = rows.get(r)!.sort((a, b) => a.c - b.c);
    const parts = cells.map((c) => {
      const col = c.addr.replace(/\d+/g, "");
      if (c.f) return `${col}{=${c.f.slice(0, 200)}}=${fmtValue(c.v)}`;
      return `${col}${fmtValue(c.v)}`;
    });
    out.push(`R${r + 1}: ${parts.join(" | ")}`);
  }
  return out;
}

/** Formula skeletons: references → R, numbers → N. Collapses 886 formulas to
 *  ~50 distinct shapes, used only when a workbook is too large to send whole. */
function skeletons(pw: ParsedWorkbook): { shape: string; count: number; example: string }[] {
  const map = new Map<string, { count: number; example: string }>();
  for (const c of pw.cells) {
    if (!c.f) continue;
    const shape = c.f.replace(/\$?[A-Z]{1,3}\$?\d+/g, "R").replace(/\d+(\.\d+)?/g, "N");
    const hit = map.get(shape);
    if (hit) hit.count++;
    else map.set(shape, { count: 1, example: `${c.sheet}!${c.addr}` });
  }
  return [...map.entries()]
    .map(([shape, v]) => ({ shape, ...v }))
    .sort((a, b) => b.count - a.count);
}

export interface WorkbookView {
  text: string;
  mode: "full" | "digest";
  stats: { sheets: number; cells: number; formulas: number; chars: number };
}

export function renderWorkbook(pw: ParsedWorkbook): WorkbookView {
  const formulas = pw.cells.filter((c) => c.f).length;
  const header: string[] = [];

  header.push(`WORKBOOK: ${pw.sheets.length} sheet(s): ${pw.sheets.join(", ")}`);
  header.push(
    `Iterative calculation: ${
      pw.iterativeCalc === null ? "unknown" : pw.iterativeCalc ? "ENABLED" : "DISABLED"
    }`
  );
  const errs = pw.cells.filter(
    (c) => c.t === "e" || (typeof c.v === "string" && /^#(REF|DIV\/0|VALUE|NAME|N\/A|NUM)/.test(c.v))
  );
  header.push(
    errs.length
      ? `Error cells (${errs.length}): ${errs.slice(0, 25).map((c) => `${c.sheet}!${c.addr}`).join(", ")}`
      : "Error cells: none"
  );
  header.push(
    "NOTATION: `C{=formula}=value` is a formula cell showing its formula and its last-saved result. " +
      "`C123` or `C\"text\"` is a typed constant with no formula. Row numbers are 1-based as in Excel."
  );

  const digestMode = formulas > MAX_FORMULA_CELLS;
  if (!digestMode) {
    const body: string[] = [];
    for (const sheet of pw.sheets) {
      const lines = renderRows(pw, sheet);
      if (!lines.length) continue;
      const sheetFormulas = pw.cells.filter((c) => c.sheet === sheet && c.f).length;
      body.push(`\n### SHEET: ${sheet}  (${lines.length} populated rows, ${sheetFormulas} formulas)`);
      body.push(...lines);
    }
    const text = [...header, ...body].join("\n");
    if (text.length <= MAX_CHARS) {
      return {
        text,
        mode: "full",
        stats: { sheets: pw.sheets.length, cells: pw.cells.length, formulas, chars: text.length },
      };
    }
  }

  // Fallback: labels, distinct formula shapes, and every row that carries a
  // returns/debt keyword — enough to audit without the full grid.
  const KEY = /irr|moic|mom|multiple|equity|debt|revolver|sweep|interest|ebitda|cash flow|fcf|exit|entry|balance/i;
  const keyRows = new Set<string>();
  for (const c of pw.cells) {
    if (typeof c.v === "string" && KEY.test(c.v)) keyRows.add(`${c.sheet}:${c.r}`);
  }
  const body: string[] = ["\n### FORMULA SHAPES (reference→R, number→N)"];
  for (const s of skeletons(pw).slice(0, 120)) body.push(`  ×${s.count}  ${s.shape}   e.g. ${s.example}`);
  body.push("\n### KEY ROWS (returns, debt, cash flow)");
  for (const sheet of pw.sheets) {
    for (const line of renderRows(pw, sheet)) {
      const r = Number(line.slice(1, line.indexOf(":"))) - 1;
      if (keyRows.has(`${sheet}:${r}`)) body.push(`${sheet} ${line}`);
    }
  }
  const text = [...header, ...body].join("\n").slice(0, MAX_CHARS);
  return {
    text,
    mode: "digest",
    stats: { sheets: pw.sheets.length, cells: pw.cells.length, formulas, chars: text.length },
  };
}

export interface CellIndex {
  cells: Set<string>;
  rows: Set<number>;
}

/** Cheap anti-hallucination check. Also tracks populated row numbers, because
 *  reviewers naturally cite a whole schedule row ("R314") rather than one cell. */
export function makeCellIndex(pw: ParsedWorkbook): CellIndex {
  const cells = new Set<string>();
  const rows = new Set<number>();
  for (const c of pw.cells) {
    cells.add(`${c.sheet}!${c.addr}`.toLowerCase());
    cells.add(c.addr.toLowerCase()); // tolerate an unqualified citation
    rows.add(c.r + 1); // 1-based, as displayed
  }
  return { cells, rows };
}

/** Accepts `Sheet!H314`, `H314`, `H314:L314`, and row-only `R314`. */
export function citationValid(index: CellIndex, ref: string): boolean {
  const clean = ref.replace(/\$/g, "").trim();
  if (!clean) return false;

  const rowOnly = clean.match(/^R(\d+)(?:\s*[-–:]\s*R?(\d+))?$/i);
  if (rowOnly) return index.rows.has(Number(rowOnly[1]));

  const first = clean.split(/[:,]/)[0].trim();
  const lower = first.toLowerCase();
  if (index.cells.has(lower)) return true;
  const bare = lower.split("!").pop() ?? "";
  return index.cells.has(bare);
}

export function lookupCell(pw: ParsedWorkbook, ref: string): number | null {
  const clean = ref.replace(/\$/g, "").trim();
  const [sheetPart, addrPart] = clean.includes("!") ? clean.split("!") : [null, clean];
  const addr = (addrPart ?? "").toUpperCase();
  for (const c of pw.cells) {
    if (c.addr !== addr) continue;
    if (sheetPart && c.sheet.toLowerCase() !== sheetPart.replace(/^'|'$/g, "").toLowerCase()) continue;
    return typeof c.v === "number" ? c.v : null;
  }
  return null;
}
