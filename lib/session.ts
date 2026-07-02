import type { CaseRow } from "./types";

// Hands the selected case from Library -> Practice within the browser session.
const KEY = "casecoach.activeCase";

export function setActiveCase(c: CaseRow) {
  sessionStorage.setItem(KEY, JSON.stringify(c));
}

export function getActiveCase(): CaseRow | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CaseRow) : null;
  } catch {
    return null;
  }
}

export function clearActiveCase() {
  sessionStorage.removeItem(KEY);
}
