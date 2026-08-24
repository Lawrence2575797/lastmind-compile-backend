create table learning_profile_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_id text not null,
  subject text not null,
  topic text not null,
  concept text not null,
  qualification text,
  exam_board text,
  created_at timestamptz not null default now(),
  unique (user_id, concept_id)
);

alter table learning_profile_entries enable row level security;
