-- Distinguishes the existing hand-authored shared bank ('authored', the
-- default - every existing row stays exactly as it was) from a row
-- generated live for one specific student by the new spec-lesson
-- Practice Questions page ('generated_live').
alter table practice_questions add column source text not null default 'authored';
alter table practice_questions add column generated_for_user_id uuid references auth.users(id) on delete cascade;

-- Which exam_question_types.type_key this row was generated against, and
-- the component split actually used for THIS question - for 'ao_additive'
-- style this mirrors exam_question_types.component_split, for 'mab' style
-- this is the real per-question M/A/B allocation the generation call
-- itself decided (see PRACTICE_QUESTION_GENERATION_PROMPT).
alter table practice_questions add column type_key text;
alter table practice_questions add column ao_component_split jsonb;
