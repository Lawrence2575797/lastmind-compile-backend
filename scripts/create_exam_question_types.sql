-- The per-subject/board catalog of exam-style question types a student
-- can pick from a spec-lesson's practice pick-list (see
-- spec_lesson_practice_picks). type_key is a stable slug, e.g. 'calc_4'
-- and 'explain_4' are two distinct 4-mark flavours for Economics (a
-- calculation vs a short explain), both real, both worth 4 marks.
create table exam_question_types (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  qualification text not null,
  exam_board text,
  type_key text not null,
  display_label text not null,        -- "4-mark calculation"
  command_word text,                  -- "Calculate" / "Explain" / "Evaluate"
  mark_tariff integer not null,
  mark_scheme_type text not null,     -- 'points' | 'levels' | 'multiple_choice' (matches practice_questions' own column)
  requires_diagram boolean not null default false,
  requires_maths_keyboard boolean not null default false,
  -- The fixed component breakdown for this exact tariff under an
  -- 'ao_additive' style, e.g. 15-mark: {"groups":[{"key":"KAA","components":["AO1","AO2","AO3"],"marks":9},
  -- {"key":"AO4","components":["AO4"],"marks":6}]}. Null for 'mab' style
  -- types - M/A/B marks are tied to one specific question's working
  -- steps, decided at generation time, not registered per tariff.
  component_split jsonb,
  -- true only where the split above is confirmed against a real
  -- published mark scheme/exam guide, not reasoned extrapolation - see
  -- seed_edexcel_econ_question_types.js's own per-row comments.
  confirmed boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create unique index idx_exam_question_types_lookup
  on exam_question_types(subject, qualification, coalesce(exam_board, ''), type_key);
alter table exam_question_types enable row level security;
