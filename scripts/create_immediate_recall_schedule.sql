-- Groundwork for the overnight spec's recall-timing model: every concept's
-- FIRST-EVER encoding pass should be followed by at least one more
-- immediate recall check a few minutes later (the spec's base schedule:
-- 2/5/10/15 minutes after the immediate one, Rb,o=2 total recalls as the
-- starting baseline before real usage data lets the full Bayesian
-- Rs/C/D/beta/gamma model calibrate personalized counts/timings - see
-- OVERNIGHT_SPEC_STATUS.md). This table records ONLY the real, honest
-- fixed-base case built so far: exactly one extra recall at +2 minutes
-- after a genuinely first-ever concept_reviews row is written.
--
-- Deliberately NOT yet wired into a distinct grading path - answering
-- this scheduled recall correctly should NOT re-advance the real FSRS
-- due date a second time within the same encoding session (concept_reviews
-- already targets that date from the first pass). That's real remaining
-- work, not done in this migration - see the code comment on
-- scheduleImmediateRecall in reviewService.ts for exactly what's built vs
-- still needed.
create table immediate_recall_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_id text not null,
  due_at timestamptz not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_immediate_recall_schedule_user_due on immediate_recall_schedule(user_id, resolved, due_at);
alter table immediate_recall_schedule enable row level security;
