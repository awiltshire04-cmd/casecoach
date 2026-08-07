-- Migration 006 — Case archetypes and the review sheet
-- Run in the Supabase SQL editor after migration_005.

-- Which lever the case turns on, how it resolves, and (for deliberately
-- balanced cases) the verdicts a strong candidate could defend. All three are
-- generation/grading metadata — none of it is ever shown before answering.
alter table cases add column if not exists archetype            text;
alter table cases add column if not exists verdict_shape        text;
alter table cases add column if not exists defensible_positions jsonb not null default '[]'::jsonb;

create index if not exists cases_archetype_idx on cases (archetype, created_at desc);

-- Durable lessons harvested at grading time. One row per bullet so the review
-- sheet can group by theme across every case, the same way question_attempts
-- lets the interview history be sliced.
create table if not exists case_takeaways (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  case_id    uuid not null references cases (id) on delete cascade,
  attempt_id uuid references attempts (id) on delete cascade,
  theme      text not null,
  text       text not null
);

create index if not exists case_takeaways_created_idx on case_takeaways (created_at desc);
create index if not exists case_takeaways_theme_idx   on case_takeaways (theme);
create index if not exists case_takeaways_case_idx    on case_takeaways (case_id);

-- Read through the service role, consistent with the interview tables.
alter table case_takeaways enable row level security;
