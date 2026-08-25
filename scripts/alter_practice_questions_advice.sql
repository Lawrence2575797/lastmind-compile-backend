-- Shown alongside each question - exam-technique advice specific to how
-- THAT question is asked (its command word/mark tariff), distinct from
-- mark_scheme_json (which is what's actually marked against).
alter table practice_questions add column answer_structure_advice text;
