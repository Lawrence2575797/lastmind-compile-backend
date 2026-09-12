-- Groundwork for the overnight spec's "global chain lessons" feature -
-- tracks consecutive FIRST-TIME-CORRECT answers per pairwise integration
-- link (from_concept_id -> to_concept_id), reset to 0 on any wrong answer
-- OR any correct-after-retry answer (only a genuinely clean first attempt
-- counts toward "successive first-time-correct" mastery). Purely additive:
-- nothing yet reads this table to gate/unlock anything - see
-- OVERNIGHT_SPEC_STATUS.md's "Chain-lesson scoping" section for what
-- still needs building on top of it (the actual chain-unlock logic,
-- chain-lesson generation, and its own UI).
create table pairwise_integration_streaks (
  user_id uuid not null references auth.users(id) on delete cascade,
  from_concept_id text not null,
  to_concept_id text not null,
  streak_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, from_concept_id, to_concept_id)
);

alter table pairwise_integration_streaks enable row level security;
