-- One row per personalized correction generated from a genuine conceptual
-- mistake on a practice_question_attempts row (see
-- examPrepCorrectionService.ts / EXAM_PREP_CORRECTION_PROMPT) - never for
-- a technique-only deduction, since exam_technique_tips already stands on
-- its own there. Consumed via Exam Preparation's own "Corrections" feed,
-- oldest-first, until answered correctly (resolved = true).
create table exam_prep_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null references practice_question_attempts(id) on delete cascade unique,
  subject text not null,
  original_question_text text not null,
  mistake_text text not null,
  correction_explanation text not null,
  followup_question_text text not null,
  followup_mark_scheme text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_exam_prep_corrections_user on exam_prep_corrections(user_id, resolved, created_at);
alter table exam_prep_corrections enable row level security;
