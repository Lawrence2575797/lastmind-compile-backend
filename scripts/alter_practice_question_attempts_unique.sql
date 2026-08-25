alter table practice_question_attempts
  add constraint practice_question_attempts_user_question_unique unique (user_id, question_id);
