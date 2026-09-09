-- One row per subject/qualification/exam-board describing which real
-- marking convention its practice questions follow. Generic on purpose -
-- Economics is additive named assessment objectives (AO1-4), A-Level
-- Maths is Method/Accuracy/independent-fact (M/A/B) marks tied to a
-- specific question's working, not a fixed per-tariff split. Neither
-- shape is hardcoded as the only option; a future subject with a third
-- shape just adds a new mark_scheme_style value + component_definitions
-- row, no schema change.
create table exam_mark_scheme_styles (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  qualification text not null,
  exam_board text,
  -- 'ao_additive' | 'mab' | (future values are additive)
  mark_scheme_style text not null,
  -- Named components for this style, used both to ground the marking/
  -- generation prompts and to render an itemized breakdown to the
  -- student generically (no hardcoded per-subject UI copy). e.g.
  -- ao_additive: [{"key":"AO1","label":"Knowledge"},{"key":"AO2","label":"Application"},
  --               {"key":"AO3","label":"Analysis"},{"key":"AO4","label":"Evaluation"}]
  -- mab:         [{"key":"M","label":"Method"},{"key":"A","label":"Accuracy"},
  --               {"key":"B","label":"Independent/brackets fact"}]
  component_definitions jsonb not null,
  notes text,
  created_at timestamptz not null default now()
);

create unique index idx_exam_mark_scheme_styles_lookup
  on exam_mark_scheme_styles(subject, qualification, coalesce(exam_board, ''));
alter table exam_mark_scheme_styles enable row level security;
