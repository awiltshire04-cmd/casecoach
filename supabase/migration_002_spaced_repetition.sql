-- Migration 002: spaced repetition on missed insights + answer-diff support.
-- Run this in the Supabase SQL editor if you already ran schema.sql.
-- (schema.sql has also been updated to include these for fresh installs.)

-- Which hidden traps the candidate missed on this attempt (subset of the case's hidden_traps).
alter table attempts
  add column if not exists missed_traps jsonb not null default '[]'::jsonb;

-- Cached "what the exemplar did that yours didn't" bullets, for the side-by-side diff.
alter table cases
  add column if not exists exemplar_gaps jsonb;

-- Rolling view of how often each trap (by case type) has been missed recently,
-- so the generator can be nudged to re-test a candidate's weak spots.
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
