# CaseCoach

Timed PE / consulting case-interview practice with AI-generated cases and rubric-anchored feedback. Next.js + Supabase + Anthropic API. Single-user v1, deployable to Vercel.

## What's built

**Core loop**
- **Library** — filter by type / industry / difficulty / length / financials / firm flavor, Randomize (respects filters), generate-on-demand → **saved to library** so cases are re-attemptable and analytics-comparable (the hybrid model).
- **Practice** — full prompt + rendered exhibit tables, countdown timer sized to case length, response box, **self-score captured before the AI reveal** (calibration), then a feedback view: score readout with weighted dimension bars, per-dimension feedback, "what this case was really testing" callouts.
- **Archive** — sortable attempts table, score-history line chart sliceable by type / industry / difficulty (self-score overlaid), and on-demand **AI trend insights**.

**Added this pass**
- **Paper LBO drill** (`/drill`) — a separate quant-rep mode. Generated scenario, 4-minute clock, you enter final answer *and* key intermediates (entry equity, exit EV, cumulative debt paydown, MOIC, IRR). Checked deterministically in code against a tolerance band, with a worked solution shown after. No AI on the math — exact and instant.
- **Side-by-side answer diff** — your answer beside an A+ exemplar, with a called-out list of specific things the exemplar did that yours didn't (generated against *your* actual answer).
- **Spaced repetition on missed insights** — the grader records which hidden traps you missed; a "traps you keep missing" panel surfaces the recurring ones, and new cases of that type are nudged to re-test them.
- **Export to PDF** — the full feedback view (case, exhibits, your answer, feedback, callouts, exemplar diff) prints cleanly via the browser. Zero dependencies.
- **Expanded firm flavors** — 18 firms, each tagged with its known case style.

## Architecture notes

- **Generation ↔ grading contract.** `generate-case` emits the prompt *plus the rubric (with per-band score anchors) plus hidden traps*, all persisted on the `cases` row. `grade-attempt` grades against that *stored* rubric, so re-attempts of the same case score consistently. The rubric encodes real PE lessons (normalize peak earnings, flywheel spread, price-don't-bet-on-macro, disaggregate multi-asset businesses).
- **Deterministic totals.** The model scores each dimension independently; the weighted total is computed in code (`computeTotal`). The paper-LBO math is fully deterministic (`lib/lbo.ts`).
- **Split models.** Faster model for generation/exemplar/trends, stronger model for grading. Override via env.
- **Key safety.** All Anthropic calls run in server-side API routes. The key lives only in env vars — never shipped to the client.

## Setup (Windows / PowerShell)

> On macOS/Linux the steps are identical except: use `cp` instead of `Copy-Item`, skip the execution-policy step, and open the env file with any editor.

### 1. Unzip and open a terminal in the folder

Right-click `casecoach.zip` → **Extract All**. Open the extracted `casecoach` folder in File Explorer, click the address bar, type `powershell`, and press Enter — this opens PowerShell already in the right directory.

Confirm Node 18.17+ is installed:
```powershell
node -v
```
If it errors, install the **LTS** from nodejs.org, then close and reopen PowerShell.

**If `npm install` fails with "running scripts is disabled on this system":** PowerShell is blocking npm's script. Fix it once for your user (no admin needed):
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```
Type `Y` to confirm. Then:
```powershell
npm install
```
(Alternative without changing policy: use `npm.cmd install` and `npm.cmd run dev` throughout.)

### 2. Set up Supabase

1. At supabase.com, create a project (save the DB password). Wait ~2 min for it to provision.
2. Open **SQL Editor** → **New query**. Paste the entire contents of `supabase\schema.sql` and click **Run**. Expect "Success, no rows returned."
   - *Already ran an earlier schema?* Also run `supabase\migration_002_spaced_repetition.sql` to add the new columns/views.
3. Go to **Project Settings → API** and copy three values: the **Project URL**, the **anon / public** key, and the **service_role** key (secret).

### 3. Get your Anthropic key and create the env file

1. At console.anthropic.com → **API Keys** → **Create Key** (starts with `sk-ant-`). Make sure the account has some credit (Billing).
2. In the project folder, copy the example file:
   ```powershell
   Copy-Item .env.local.example .env.local
   notepad .env.local
   ```
3. Fill in all five values, then save and close:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```

> **Windows gotcha:** Notepad may silently save the file as `.env.local.txt`. Turn on **View → File name extensions** in File Explorer to check. If it's wrong: `Rename-Item .env.local.txt .env.local`. The app won't see your keys until the filename is exactly `.env.local`.

**Model names.** The app defaults to `claude-sonnet-4-6` (generation) and `claude-opus-4-8` (grading). If a call fails with a model error, your account may use different identifiers — override in `.env.local` without touching code, e.g.:
```
GENERATE_MODEL=claude-sonnet-4-5
GRADE_MODEL=claude-sonnet-4-5
```
Restart the dev server after any `.env.local` change (env is only read at startup).

### 4. Run it

```powershell
npm run dev
```
Open **http://localhost:3000**.

**Smoke test:** Library → **Generate & start** (first generation ~15-30s) → respond → self-score → **Reveal AI score** → check the diff and **Export to PDF** → open **Archive**. Try the **Paper LBO** tab for a quant rep. (Trend insights and the missed-traps panel need 3+ attempts before they populate.)

### Troubleshooting

- **Stuck on "Generating…" / 500 error** — look at the PowerShell window running `npm run dev`; the real error prints there. Most common: wrong model name (see override above), no Anthropic credit, or a mistyped key.
- **Blank Library or Archive** — Supabase env typo, or `schema.sql` didn't run. Check the browser console and the dev-server terminal.
- **`npm` not recognized** — reopen PowerShell after installing Node.
- **Port 3000 busy** — `npm run dev -- -p 3001`, then open localhost:3001.

## Deploy to Vercel

Push to a Git repo, import it in Vercel, and add the same five env vars in **Project Settings → Environment Variables**. The `/api/*` routes run as serverless functions (`maxDuration` 60s for the model calls).

## Cost shape

Per full case: 1 generation call + 1 grading call, plus optional exemplar/diff (lazy) and trend-insight calls. Grading uses the stronger model; everything else uses the faster one. Paper-LBO drills make **no** model calls.

## Roadmap (not yet built)

Next highest value-to-effort:
1. **Optional follow-up questions** — 1–2 probing follow-ups after the initial answer, scored separately (reuses the stored rubric). Schema has a `followups` column.
2. **Interviewer interruption mode** — AI pushes back mid-answer (the live-rep dynamic).
3. **Difficulty auto-tuning** — weight the randomizer toward lagging case types (the `type_performance` view already computes the signal).
4. **Verbal mode** — record audio → transcription → grade the transcript. Schema has `response_audio_url` / `transcript`. Biggest realism upgrade; most infra.

## Multi-user later

v1 is single-user with no RLS. Before exposing to multiple users: add Supabase Auth, a `user_id` column on both tables, and RLS policies scoping rows to `auth.uid()`.
