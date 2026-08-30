-- A diagram answer has no free text - the student's submission is
-- structured curve/shading/label placements instead (see
-- DiagramAnswerSubmission in practiceQuestionService.ts). answer_text
-- stays required for every other mark_scheme_type, so it's relaxed to
-- nullable rather than dropped.
alter table practice_question_attempts add column answer_json jsonb;
alter table practice_question_attempts alter column answer_text drop not null;
