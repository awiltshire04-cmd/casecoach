# CaseCoach — Modelling Test Trainer (update 003)

This update adds the **Model Test** tab: full LBO modelling-test generation
(direct-assumptions or CIM mode), a solver-computed answer key, timed attempts,
.xlsx upload grading (outputs vs. reference + static formula analysis), quirk
hints, and a graded investment write-up.

## What's new / changed

**New files**
- `lib/modeltest/types.ts` — toggle registry (basic = PF L4/5, advanced = beyond; phase A/B), schemas
- `lib/modeltest/solver.ts` — deterministic LBO engine + validation (the answer key)
- `lib/modeltest/prompts.ts` — params generation, rendering, hints, formula review, write-up grading
- `lib/modeltest/extract.ts` — workbook parsing, checkpoint extraction, hygiene analysis
- `app/api/modeltest-generate/route.ts`, `app/api/modeltest-hint/route.ts`, `app/api/modeltest-submit/route.ts`
- `app/modeltest/page.tsx` — the UI
- `supabase/migration_003_model_tests.sql`

**Changed files (replaced wholesale by this zip)**
- `components/Rail.tsx` — adds the 05 · Model Test tab
- `app/globals.css` — styles for toggles, pagination, quirks, grade tables
- `package.json` / `package-lock.json` — adds `xlsx` and `fflate`

> If you've hand-edited any of those three changed files since the last zip,
> compare before overwriting (`git diff` after unzipping shows exactly what changed).

## Install steps

1. **Unzip over your project root** (the folder with `package.json`):
   - Windows: right-click `casecoach_update_003.zip` → Extract All → into your
     project folder → accept "replace files".
2. **Install the two new packages** (PowerShell, in the project folder):
   ```
   npm install
   ```
3. **Run the database migration**: Supabase dashboard → SQL Editor → paste the
   contents of `supabase/migration_003_model_tests.sql` → Run.
   This creates `model_tests`, `model_test_attempts`, **and** the private
   `model-submissions` storage bucket (the insert into `storage.buckets` at the
   bottom — no dashboard clicking needed).
4. **Test locally** (optional but recommended):
   ```
   npm run dev
   ```
   → http://localhost:3000/modeltest → generate a Level 3 test as a smoke test.
5. **Deploy** (PowerShell, one line at a time):
   ```
   git add .
   git commit -m "Add modelling test trainer"
   git push
   ```
   Vercel auto-deploys from the push. **No new environment variables** — the
   module reuses `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and the two
   `NEXT_PUBLIC_SUPABASE_*` vars already configured.

## Notes

- Generation makes two model calls (scenario params → rendered case) with the
  deterministic solver in between; if the solver rejects a scenario it retries
  once, then surfaces the error in the UI (no more silent failures).
- Grading weights: outputs vs. key 45%, structure/hygiene 20%, concept
  mechanics 20%, write-up 15%. Speed is contextual, not scored.
- The timer anchors server-side at case open; closing the tab doesn't stop it
  (matching real test conditions). Abandon and regenerate if you need a reset.
- Phase B (greyed) toggles: seller note, earnout, tax election, minority
  interest, straight preferred, covenants, MIP waterfall, QoE, capex split,
  mezz + warrants, DDTL, divestiture, NWC peg — solver support lands next pass.
