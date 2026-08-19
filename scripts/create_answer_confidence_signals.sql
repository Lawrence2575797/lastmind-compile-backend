create table answer_confidence_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  concept_id text not null,
  response_time_ms integer not null,
  is_time_outlier boolean not null default false,
  confidence_rating integer, -- 1 = sure, 2 = kind of guessed, 3 = really unsure; null until answered
  created_at timestamptz not null default now()
);

create index idx_answer_confidence_signals_user on answer_confidence_signals(user_id, created_at);
