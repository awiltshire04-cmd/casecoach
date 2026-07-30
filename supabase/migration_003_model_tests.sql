-- Migration 003 — Modelling Test Trainer
-- Run in the Supabase SQL editor after schema.sql and migration_002.

create table if not exists model_tests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  params jsonb not null,              -- GenerateTestParams (concepts, difficulty, presentation…)
  case_structured jsonb not null,     -- Stage-1 ground truth
  case_rendered jsonb not null,       -- {pages:[{title,body}]}
  quirks jsonb not null default '[]'::jsonb,
  conventions jsonb not null default '[]'::jsonb,
  reference_solution jsonb not null,  -- Stage-2 solver output
  hints_cache jsonb not null default '{}'::jsonb
);

create table if not exists model_test_attempts (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references model_tests(id) on delete cascade,
  opened_at timestamptz not null default now(),
  submitted_at timestamptz,
  time_taken_sec integer,
  file_path text,
  writeup text,
  outputs_extracted jsonb,
  grade jsonb,
  status text not null default 'open'  -- open | graded | error
);

create index if not exists idx_mta_test on model_test_attempts(test_id);
create index if not exists idx_mta_opened on model_test_attempts(opened_at desc);

-- Private storage bucket for submitted workbooks (service role uploads bypass RLS).
insert into storage.buckets (id, name, public)
values ('model-submissions', 'model-submissions', false)
on conflict (id) do nothing;
