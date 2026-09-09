-- The quota mechanic for the spec-hierarchy Practice Questions page: at
-- most 3 question-type picks total per (student, spec-lesson), each type
-- pickable only once, the pick-list shrinking as each is used. concept_id
-- is spec_lesson_plans.concept_id for the picked spec-lesson - the same
-- normalizeConceptKey space practice_questions/concept_reviews already
-- use, so this joins straight onto both without a translation layer.
create table spec_lesson_practice_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_id text not null,
  subject text not null,
  qualification text not null,
  exam_board text,
  type_key text not null,
  question_id uuid references practice_questions(id) on delete set null,
  picked_at timestamptz not null default now()
);

-- One pick per (student, spec-lesson, type) - the DB-level guard against
-- picking the same type twice; the "3 total" cap itself is an application-
-- level count check (see specLessonPracticeService.ts), since it needs a
-- friendly 409 rather than a raw constraint violation.
create unique index idx_spec_lesson_practice_picks_unique
  on spec_lesson_practice_picks(user_id, concept_id, type_key);
create index idx_spec_lesson_practice_picks_lookup
  on spec_lesson_practice_picks(user_id, concept_id);
alter table spec_lesson_practice_picks enable row level security;
