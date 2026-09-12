-- Groundwork tables for the Bayesian recall-scheduling model (Rs/C/D/beta/
-- gamma - see the user's own spec, recorded in the session that built
-- this). Two new tables:
--
-- user_recall_tuning - ONE row per student (global, not per-subject, per
-- explicit instruction), holding every piece of state the model updates
-- over time: base_recalls (Rb,o - starts at 2, +1 on a genuine Day-1
-- failure), beta (starts at 0 - the model behaves exactly like today's
-- fixed schedule until enough Day-1 outcomes justify personalizing it),
-- and the gamma hill-climbing state (gamma itself, the current step size
-- delta_gamma, which direction it's currently moving, and the last
-- recall outcome it compared against to decide whether to keep going or
-- reverse+halve - see updateGammaAfterRecall's own comment for the exact
-- rule this reproduces).
--
-- day1_checks - the day-after check for a concept's first encoding OR a
-- link's first integration (both count separately, same as concept_reviews
-- already tracks a node's own concept_id and each edge's own
-- `::integration` concept_id as distinct rows). due_date is a DATE, not a
-- timestamp - "it doesn't matter the time of day" - and deliberately
-- never expires: unlike an immediate recall (which gives up after a
-- grace window), a missed Day-1 check just stays due and keeps
-- outranking new lessons in the feed until the student actually does it,
-- however many days that takes.
create table if not exists user_recall_tuning (
  user_id uuid primary key references auth.users(id) on delete cascade,
  base_recalls integer not null default 2,
  beta numeric not null default 0,
  gamma numeric not null default 0,
  delta_gamma numeric not null default 0.1,
  gamma_direction smallint not null default 1,
  last_recall_outcome boolean,
  updated_at timestamptz not null default now()
);
alter table user_recall_tuning enable row level security;

create table if not exists day1_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_id text not null,
  due_date date not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, concept_id)
);
create index if not exists idx_day1_checks_user_due on day1_checks(user_id, resolved, due_date);
alter table day1_checks enable row level security;

-- Extends the existing immediate-recall cascade (previously always
-- exactly one recall at +2 minutes) to run until Rs successes are
-- reached, not just one fixed check. recall_number is this row's
-- position in ITS OWN concept's cascade (1 = the first scheduled recall,
-- i.e. the existing +2 minute one); target_recalls is Rs as computed
-- ONCE when the cascade started, copied onto every row in it so the
-- target stays stable even if the student's live capability (C) drifts
-- slightly while the cascade is still running.
alter table immediate_recall_schedule add column if not exists recall_number integer not null default 1;
alter table immediate_recall_schedule add column if not exists target_recalls integer not null default 2;
