-- CaseCoach schema
-- Single-user v1: no auth / RLS. Add Supabase Auth + RLS before multi-user.

-- ---------------------------------------------------------------------------
-- cases: the persisted library. Every generated case is saved here so it
-- becomes re-attemptable and comparable in analytics (the "hybrid" model).
-- ---------------------------------------------------------------------------
create table if not exists cases (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  -- filterable metadata
  type              text not null,          -- lbo | market_entry | profitability | growth | m_and_a | ...
  length            text not null,          -- short | medium | long
  has_financials    boolean not null default false,
  industry          text not null,
  difficulty        text not null,          -- easy | medium | hard
  firm_flavor       text,                   -- nullable: advent | bain | ... 

  title             text not null,

  -- content
  prompt            text not null,
  exhibits          jsonb not null default '[]'::jsonb,   -- [{kind:'table', title, columns[], rows[][]}, ...]

  -- grading contract, defined AT GENERATION TIME so re-attempts score consistently
  rubric            jsonb not null,         -- {dimensions:[{key,label,weight,anchors:{'90','70','50'}}], ...}
  hidden_traps      jsonb not null default '[]'::jsonb,   -- ["normalize peak EBITDA", "flywheel spread", ...]

  suggested_time_sec integer not null,

  -- lazily generated on first feedback view to save tokens
  exemplar          text,
  exemplar_gaps     jsonb,                  -- ["did X that yours didn't", ...] for the side-by-side diff

  generation_params jsonb not null default '{}'::jsonb
);

create index if not exists cases_type_idx        on cases (type);
create index if not exists cases_industry_idx    on cases (industry);
create index if not exists cases_difficulty_idx  on cases (difficulty);
create index if not exists cases_created_idx      on cases (created_at desc);

-- ---------------------------------------------------------------------------
-- attempts: one row per practice run.
-- ---------------------------------------------------------------------------
create table if not exists attempts (
  id                uuid primary key default gen_random_uuid(),
  case_id           uuid not null references cases (id) on delete cascade,
  created_at        timestamptz not null default now(),

  response          text not null default '',
  response_audio_url text,                  -- verbal mode (later phase)
  transcript        text,                   -- verbal mode (later phase)

  -- calibration: captured BEFORE the AI score is revealed
  self_score        integer,               -- 0..100, nullable

  ai_score          integer,               -- 0..100
  dimension_scores  jsonb,                 -- {structure:82, quant:70, judgment:88, comms:75, prioritization:80}
  feedback          jsonb,                 -- {dimensions:{key:text}, tests_callouts:[{title,body}]}

  -- follow-up round (optional), scored separately
  followups         jsonb,                 -- [{question, response, score, feedback}]

  -- spaced repetition: which of the case's hidden_traps this attempt missed
  missed_traps      jsonb not null default '[]'::jsonb,

  time_allotted_sec integer not null,
  time_taken_sec    integer not null,
  submitted_early   boolean not null default false,

  -- organization
  flagged           boolean not null default false,
  tags              text[] not null default '{}'
);

create index if not exists attempts_case_idx    on attempts (case_id);
create index if not exists attempts_created_idx on attempts (created_at desc);

-- ---------------------------------------------------------------------------
-- analytics views (computed live; promote to materialized only if slow)
-- ---------------------------------------------------------------------------

-- flat attempt history joined to case metadata, for charts + tables
create or replace view attempt_history as
select
  a.id,
  a.created_at,
  a.ai_score,
  a.self_score,
  (a.self_score - a.ai_score)          as calibration_gap,
  a.time_allotted_sec,
  a.time_taken_sec,
  a.submitted_early,
  (a.time_allotted_sec - a.time_taken_sec) as time_remaining_sec,
  a.dimension_scores,
  a.flagged,
  a.tags,
  c.id                                  as case_id,
  c.type,
  c.industry,
  c.difficulty,
  c.length,
  c.firm_flavor,
  c.title
from attempts a
join cases c on c.id = a.case_id
where a.ai_score is not null;

-- per-case-type rolling performance, drives the adaptive randomizer (weak-spot weighting)
create or replace view type_performance as
select
  c.type,
  count(*)                              as attempts,
  round(avg(a.ai_score))                as avg_score,
  round(avg(a.ai_score) filter (where a.created_at > now() - interval '14 days')) as avg_score_recent
from attempts a
join cases c on c.id = a.case_id
where a.ai_score is not null
group by c.type;

-- ---------------------------------------------------------------------------
-- lbo_drills: paper-LBO quant reps (separate from the case flow).
-- ---------------------------------------------------------------------------
create table if not exists lbo_drills (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  scenario          jsonb not null,        -- {entry_ebitda, entry_multiple, leverage_turns, ...}
  correct           jsonb not null,        -- {entry_equity, exit_ev, debt_paydown, moic, irr}
  difficulty        text not null default 'medium',

  submitted         jsonb,                 -- user's entered {entry_equity, exit_ev, debt_paydown, moic, irr}
  correctness       jsonb,                 -- per-field pass/fail within tolerance
  passed            boolean,
  time_taken_sec    integer
);

create index if not exists lbo_drills_created_idx on lbo_drills (created_at desc);

-- ---------------------------------------------------------------------------
-- spaced repetition view (also in migration_002)
-- ---------------------------------------------------------------------------
create or replace view missed_trap_frequency as
select
  c.type,
  trap.value                              as trap,
  count(*)                                as times_missed,
  max(a.created_at)                       as last_missed_at
from attempts a
join cases c on c.id = a.case_id
cross join lateral jsonb_array_elements_text(a.missed_traps) as trap(value)
where a.created_at > now() - interval '30 days'
group by c.type, trap.value
order by times_missed desc;
