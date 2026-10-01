-- Records every lesson-generation failure (checker rejection after all
-- content attempts, or an infra/network error after all transient retries)
-- with its real reason - previously these vanished into console.error with
-- no persisted trace, so there was no way to measure which validator rule
-- or failure mode actually fires most often in practice.
create table if not exists generation_failures (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  qualification text not null,
  exam_board text not null,
  stage_index integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists generation_failures_created_at_idx
  on generation_failures (created_at desc);
