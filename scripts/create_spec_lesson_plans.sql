-- The canonical, dependency-ordered lesson breakdown for a real spec
-- topic (theme/subtopic) - generated once by hand (see the founder's own
-- Claude Code sessions), following the same "genuine dependency order,
-- exam-board depth" standard CORTEX_INTENT_PROMPT rule 8 already asks
-- Cortex to apply live. Storing it here means every student's folder for
-- the same real topic gets the SAME lesson names/order (see
-- decideCortexAction's context-injection), and practice_questions can be
-- seeded against the exact same concept_id space pages will actually use.
create table spec_lesson_plans (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  qualification text not null,
  exam_board text,
  theme text not null,
  subtopic text not null,
  lesson_order integer not null,
  concept text not null,
  branch text not null, -- e.g. 'Microeconomics' | 'Macroeconomics' - subject-appropriate top-level classification
  concept_id text not null, -- normalizeConceptKey(subject, subtopic, concept) - same key pages/reviews/practice_questions all use
  created_at timestamptz not null default now()
);

create unique index idx_spec_lesson_plans_lookup on spec_lesson_plans(subject, qualification, coalesce(exam_board, ''), subtopic, lesson_order);
create index idx_spec_lesson_plans_concept_id on spec_lesson_plans(concept_id);
alter table spec_lesson_plans enable row level security;
