-- Expected-diagram spec for a 'diagram' mark_scheme_type question - which
-- curve shapes are needed, their relative-position requirements, the
-- region to shade, and expected labels. Deliberately never stores fixed
-- coordinates: it's checked against wherever the student actually places
-- their own curves at grading time, since this is a placement exercise,
-- not a pixel-matching one. Null for every non-diagram question.
alter table practice_questions add column diagram_spec jsonb;
