-- Migration 004 — Interview question bank (behavioral + technical)
-- Run in the Supabase SQL editor after schema.sql, 002 and 003.
--
-- One bank serves both sections: `section` discriminates behavioral from
-- technical so the answering flow, grading pipeline and attempt history are
-- shared rather than duplicated.
--
-- RLS is ENABLED with no policies on purpose. Every read and write goes through
-- a service-role API route, so the public anon key must not see these tables.
-- (Contrast with `cases`/`attempts`, which predate that decision.)

create table if not exists questions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  section       text not null check (section in ('behavioral', 'technical')),
  category      text not null,
  prompt        text not null,

  difficulty    text not null default 'core',     -- core | stretch
  source        text not null default 'seed',     -- seed | book | generated
  source_ref    text,                             -- e.g. chapter / section of the handbook
  concept_tags  text[] not null default '{}',

  -- What a strong answer contains. Fed to the grader as context so scoring is
  -- anchored to the question rather than to generic interview advice.
  guidance      text,

  active        boolean not null default true,
  unique (section, prompt)
);

create index if not exists questions_section_idx  on questions (section, category) where active;

-- A multi-question run. Standalone practice attempts have no session.
create table if not exists interview_sessions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  section       text not null,
  planned_count integer not null,
  status        text not null default 'active',   -- active | complete | abandoned
  overall       jsonb                             -- {score, summary, strengths[], priorities[]}
);

create index if not exists interview_sessions_created_idx on interview_sessions (created_at desc);

create table if not exists question_attempts (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  question_id   uuid not null references questions (id) on delete cascade,
  session_id    uuid references interview_sessions (id) on delete set null,
  ordinal       integer,                          -- position within a session

  transcript    text not null default '',
  input_mode    text not null default 'voice',    -- voice | typed
  duration_sec  integer,
  word_count    integer,

  score         integer,                          -- 0..100, weighted in code
  breakdown     jsonb,                            -- {delivery, content, articulation, structure}
  feedback      jsonb,                            -- {worked[], cut[], add[], rewrites[]}
  metrics       jsonb,                            -- {wpm, fillerCount, fillerRate, ...}
  followup      jsonb,                            -- {asked, reason, question, transcript}

  -- Part 3 study mode; harmless for behavioral attempts.
  flagged       boolean not null default false,
  flag_reason   text                              -- wrong | unclear
);

create index if not exists question_attempts_q_idx       on question_attempts (question_id);
create index if not exists question_attempts_session_idx on question_attempts (session_id);
create index if not exists question_attempts_created_idx on question_attempts (created_at desc);
create index if not exists question_attempts_flagged_idx on question_attempts (flagged) where flagged;

alter table questions           enable row level security;
alter table interview_sessions  enable row level security;
alter table question_attempts   enable row level security;

-- ---------------------------------------------------------------------------
-- Behavioral seed bank.
-- Phrasings deliberately vary within each category so repeated practice doesn't
-- drill one fixed script. Add more rows here or straight from the Supabase table
-- editor — no code change required.
-- ---------------------------------------------------------------------------

insert into questions (section, category, prompt, difficulty, guidance) values

-- ---- summer experience -------------------------------------------------
('behavioral', 'summer_experience', 'What did you work on last summer?', 'core',
 'Wants a concrete deal or project, your specific role in it, and what actually happened. Strong answers name the sector, the size, what the analysis showed, and the outcome — not a tour of the whole desk.'),
('behavioral', 'summer_experience', 'Walk me through the deal you spent the most time on this summer.', 'core',
 'Expects transaction mechanics: what the company did, why the sponsor was interested, what you built or diligenced, where it landed. Should show ownership of a piece, not narration of the team''s work.'),
('behavioral', 'summer_experience', 'What did you learn last summer?', 'core',
 'Wants a specific, non-obvious lesson tied to a moment, plus evidence it changed how they work. "I learned to be detail-oriented" is a weak answer; a concrete mistake and the correction is strong.'),
('behavioral', 'summer_experience', 'Tell me about something that went wrong last summer and what you did about it.', 'stretch',
 'Tests accountability. Strong answers own the error plainly, explain the fix and the systemic change, and avoid blaming staffing or the model they inherited.'),
('behavioral', 'summer_experience', 'What was the most interesting thing you saw on a live deal?', 'core',
 'Wants genuine intellectual engagement — a structural quirk, a diligence finding that changed the thesis, a valuation debate. Should show they were thinking about the deal, not just producing pages.'),
('behavioral', 'summer_experience', 'Which part of your summer did you find least enjoyable, and why?', 'stretch',
 'Tests self-awareness and honesty without negativity. Strong answers are specific, non-disqualifying, and end with what they took from it.'),
('behavioral', 'summer_experience', 'How did your summer change what you want to do in finance?', 'core',
 'Connects experience to direction. Wants a real update to their thinking, with the specific exposure that caused it.'),
('behavioral', 'summer_experience', 'What feedback did you get last summer, and what did you do with it?', 'stretch',
 'Wants real feedback, not a humblebrag. Strong answers quote it closely, describe the behavioural change, and give evidence it stuck.'),

-- ---- forward looking ---------------------------------------------------
('behavioral', 'forward_looking', 'What are you excited about for full-time?', 'core',
 'Wants specificity about the work itself — ownership of workstreams, sector depth, seeing deals through. Generic enthusiasm about "learning a lot" is weak.'),
('behavioral', 'forward_looking', 'What do you want to get better at over your first two years?', 'core',
 'Tests honest self-assessment plus a plan. Should name a real gap and how the seat addresses it.'),
('behavioral', 'forward_looking', 'Why private equity rather than staying in banking?', 'core',
 'Wants a considered view of the difference — ownership, holding period, being on the investing side of the decision. Should not disparage banking or recite recruiting talking points.'),
('behavioral', 'forward_looking', 'Where do you want to be in five years?', 'core',
 'Wants direction without arrogance. Strong answers connect near-term skill building to a plausible longer arc and stay honest about uncertainty.'),
('behavioral', 'forward_looking', 'What kind of investor do you think you''ll become?', 'stretch',
 'Tests whether they have a developing philosophy — where they think edge comes from, what kind of businesses they gravitate to, and why.'),
('behavioral', 'forward_looking', 'What would make your first year here a success?', 'core',
 'Wants concrete, observable outcomes rather than sentiment. Bonus for framing success partly as what the team gets from them.'),
('behavioral', 'forward_looking', 'Which part of the job do you think you''ll find hardest?', 'stretch',
 'Tests realism about the seat. Strong answers pick something genuinely hard and describe how they''d attack it.'),

-- ---- firm specific -----------------------------------------------------
('behavioral', 'firm_specific', 'Tell me about a portfolio company of ours you like.', 'core',
 'Requires real homework: what the company does, why the firm bought it, the value-creation angle, and where the returns come from. Naming a company without a thesis is a fail.'),
('behavioral', 'firm_specific', 'Which of our deals would you have passed on, and why?', 'stretch',
 'Tests independent judgment and nerve. Wants a respectful but genuine objection grounded in price, competitive position or underwriting risk.'),
('behavioral', 'firm_specific', 'What''s your favorite business, and why?', 'core',
 'Wants investor reasoning, not fandom: durable advantage, unit economics, reinvestment runway, why it stays defensible. Should end with why it''s a good business, not just a good product.'),
('behavioral', 'firm_specific', 'What business do you admire that would make a bad investment?', 'stretch',
 'Tests the split between a great company and a great entry price. Wants an explicit valuation or structural reason the returns don''t work.'),
('behavioral', 'firm_specific', 'Why this firm rather than a generalist megafund?', 'core',
 'Wants specifics on strategy, sector focus, check size or operating model — evidence they understand what makes the platform different.'),
('behavioral', 'firm_specific', 'What do you think our biggest competitive advantage is?', 'stretch',
 'Tests understanding of how PE firms actually differentiate: sourcing, sector relationships, operating capability, capital structure creativity.'),
('behavioral', 'firm_specific', 'If you joined tomorrow, which sector would you want to cover and why?', 'core',
 'Wants a reasoned sector view tied to the firm''s actual activity, plus what they''d bring to it.'),

-- ---- investment thesis -------------------------------------------------
('behavioral', 'investment_thesis', 'Pitch me an LBO candidate.', 'core',
 'Wants the buyout logic explicitly: stable and predictable cash flow, defensible position, levers for margin or growth, a credible exit, and a rough sense of entry multiple and leverage capacity.'),
('behavioral', 'investment_thesis', 'Pitch me a business you''d buy and hold for ten years.', 'core',
 'Tests durability thinking over financial engineering — moat, reinvestment runway, terminal risk. Should say what would have to be true in year ten.'),
('behavioral', 'investment_thesis', 'Tell me about an emerging asset class you''d like to invest in.', 'stretch',
 'Wants a real structural argument: why the asset class exists now, who the natural owners are, what the return drivers and liquidity constraints look like.'),
('behavioral', 'investment_thesis', 'Give me a short idea — a business you would bet against.', 'stretch',
 'Tests whether they can invert a thesis. Wants the specific mechanism of decline and a catalyst, not just "it looks expensive".'),
('behavioral', 'investment_thesis', 'Walk me through a company you''ve followed and how your view of it has changed.', 'stretch',
 'Tests genuine tracking over time and willingness to update. Wants the evidence that moved them.'),
('behavioral', 'investment_thesis', 'What would you need to believe for your pitch to be wrong?', 'stretch',
 'Tests intellectual honesty. Strong answers name the two or three assumptions doing the most work and how they''d monitor them.'),
('behavioral', 'investment_thesis', 'Pitch me a carve-out or divestiture opportunity.', 'stretch',
 'Wants understanding of why the asset is mispriced inside its parent, the stand-up cost, and the operational lift required post-close.'),
('behavioral', 'investment_thesis', 'What''s a business you think is misunderstood by the market?', 'core',
 'Wants a variant view stated plainly: what consensus believes, why it''s wrong, and what closes the gap.'),

-- ---- market view -------------------------------------------------------
('behavioral', 'market_view', 'Where do you think the market is heading?', 'core',
 'Wants a defensible framing rather than a prediction: what the key variables are, what they''re watching, and how they''d position. Should avoid a confident macro call with no reasoning.'),
('behavioral', 'market_view', 'Tell me about an industry trend you''re seeing and what the future looks like.', 'core',
 'Wants a specific trend, evidence it''s real, who wins and loses, and the investable implication.'),
('behavioral', 'market_view', 'How does the current rate environment change how you''d underwrite a deal?', 'stretch',
 'Tests mechanical understanding: cost of debt, leverage capacity, entry multiples, exit assumptions, and the shift toward operational value creation.'),
('behavioral', 'market_view', 'What''s the most contrarian view you hold about a sector right now?', 'stretch',
 'Wants genuine divergence from consensus with the reasoning that supports it, held with appropriate humility.'),
('behavioral', 'market_view', 'Which sector would you avoid deploying capital in today, and why?', 'core',
 'Tests risk framing. Wants structural reasons — competitive dynamics, capital intensity, regulatory exposure — rather than sentiment.'),
('behavioral', 'market_view', 'How do you think AI changes the businesses we invest in?', 'stretch',
 'Wants a grounded, specific answer about cost structure, moat durability or demand — not a generic technology narrative.'),
('behavioral', 'market_view', 'What''s something you''ve read recently that changed your mind?', 'core',
 'Tests active reading and willingness to update. Wants the source, the prior view and the revised one.')

on conflict (section, prompt) do nothing;
