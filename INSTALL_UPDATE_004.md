# CaseCoach Update 004 — Redesign, Archive, Phase B Concepts, Concepts Page, Random Industry

## What's in this update
1. **Visual redesign** — light editorial system per the reference screenshot: white ground, near-black ink, heavy Inter headings, pill buttons, rounded cards, centered 1160px column. The blue left rail is now a **top navigation bar** (same component file, so nothing else changed).
2. **Six concepts promoted to live** — QoE Adjustments, Maintenance vs Growth Capex, Mezzanine + Warrants, Delayed-Draw Term Loan, Divestiture, and NWC Peg / True-Up are now selectable on the Model Test setup screen. The original seven advanced concepts (seller note, earnout, tax election, minority interest, straight preferred, covenants, MIP waterfall) remain greyed for a later phase.
3. **Archive, rebuilt** — case attempt rows are now clickable and reopen read-only (prompt, exhibits, your response, feedback, exemplar diff, PDF export). New Model Tests section below with concept filters and date sort; each row reopens the full case pages (re-download the PDF via print) plus a **Download My Excel** button that pulls your submitted workbook from storage via a short-lived signed URL.
4. **Concepts tab** — a reference page for all 25 concepts: what each is, why tests use it, and generic Excel build steps. Phase-two concepts are documented ahead of solver support and marked Coming Soon.
5. **Random industry** — new default "Random" option in Model Test, Paper LBO, and Library generation. The pick resolves at generation time, is persisted, and shows in the run header / scenario card.
6. **Formatting pass** — title case on buttons, options, and headings throughout.

## Install
1. Unzip over your project root (`casecoach/`), replacing files. New files land in new folders automatically.
2. **No database migration this round. No new environment variables. No new npm packages.**
3. From the PROJECT ROOT (not a subfolder — remember last time):
   ```
   git add .
   git commit -m "Round 2: redesign, archive detail views, Phase B concepts, concepts page, random industry"
   git push
   ```
4. Vercel redeploys automatically.

## Files changed
- `app/globals.css`, `app/layout.tsx`, `components/Rail.tsx` — design system + top nav
- `lib/modeltest/types.ts`, `solver.ts`, `prompts.ts`, `extract.ts` — six concepts live (solver hand-check tested; balance checks tie to 0.0)
- `lib/modeltest/help-content.ts` (new), `app/concepts/page.tsx` (new) — reference
- `app/archive/page.tsx`, `app/archive/case/[id]/page.tsx` (new), `app/archive/mt/[id]/page.tsx` (new), `app/api/modeltest-file/route.ts` (new) — archive
- `lib/lbo.ts`, `app/api/lbo-drill/route.ts`, `app/page.tsx`, `app/drill/page.tsx`, `app/practice/page.tsx`, `app/modeltest/page.tsx` — random industry + title case
