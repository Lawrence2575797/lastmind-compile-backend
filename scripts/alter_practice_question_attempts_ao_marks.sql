-- Itemized per-component marks awarded, e.g. {"AO1":2,"AO2":2,"AO3":3,"AO4":4}
-- or {"M":3,"A":1,"B":0}. Nullable - every existing row, and every
-- multiple_choice row going forward, stays null; mark_awarded remains the
-- one authoritative total in all cases, this is additional detail only.
alter table practice_question_attempts add column ao_component_marks jsonb;
