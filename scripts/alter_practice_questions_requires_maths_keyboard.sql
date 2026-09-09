-- Whether this question's answer input should mount the maths shortcut
-- editor (exponents/fractions/integrals, Greek Shift+letter, etc) instead
-- of a plain textarea - known at generation time from the picked
-- exam_question_types.requires_maths_keyboard, persisted here so it
-- survives a page reload before the question is answered (once answered,
-- the input locks regardless, but a not-yet-answered question needs this
-- on every fetch, not just the initial generate response).
alter table practice_questions add column requires_maths_keyboard boolean not null default false;
