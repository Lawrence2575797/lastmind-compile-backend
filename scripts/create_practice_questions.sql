-- Batch-generated content (see the founder's own Claude Code sessions,
-- not live per-student generation) - concept_id is the same
-- normalizeConceptKey(subject, topic, concept) key used everywhere else
-- in this app (concept_reviews, learning_profile_entries), so a
-- question is found by matching whatever page the student clicked, the
-- same way reviews/verification already resolve to a page.
create table practice_questions (
  id uuid primary key default gen_random_uuid(),
  concept_id text not null,
  subject text not null,
  topic text not null,
  concept text not null,
  qualification text not null,
  exam_board text,
  question_text text not null,
  mark_tariff integer not null,
  requires_diagram boolean not null default false,
  -- 'points' (a fixed number of marks per named assessment objective,
  -- summed) or 'levels' (a small number of holistic bands, each with its
  -- own mark range and descriptor) - the two real structures found when
  -- researching actual exam board mark schemes this session (Economics
  -- vs Psychology). mark_scheme_json's shape depends on which this is;
  -- the marking prompt is told which type it's looking at.
  mark_scheme_type text not null,
  mark_scheme_json jsonb not null,
  created_at timestamptz not null default now()
);

create index idx_practice_questions_concept_id on practice_questions(concept_id);
alter table practice_questions enable row level security;

-- One row per graded attempt - not read back by the app yet, but kept
-- for the same reason concept_reviews keeps a review_log: a record of
-- what was actually marked, for future spot-checking or a "past
-- attempts" view.
create table practice_question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references practice_questions(id) on delete cascade,
  answer_text text not null,
  mark_awarded integer not null,
  mark_tariff integer not null,
  feedback text not null,
  created_at timestamptz not null default now()
);

alter table practice_question_attempts enable row level security;
