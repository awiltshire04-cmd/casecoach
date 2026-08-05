-- Migration 005 — Technical section support
-- Run in the Supabase SQL editor after migration_004.
--
-- One column. Study mode needs a plain-language explanation of the correct
-- answer, which is a different thing from `guidance` (a short note telling the
-- grader what a complete answer must contain). Keeping them separate means the
-- study text can be written for a human who just got the question wrong.

alter table questions add column if not exists explanation text;

-- Flagged questions are looked up constantly in study mode; the attempts index
-- from 004 covers the flag itself, this one covers "which questions are flagged".
create index if not exists question_attempts_flag_lookup
  on question_attempts (question_id, flagged) where flagged;
