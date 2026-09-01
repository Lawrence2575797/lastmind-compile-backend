create table math_help_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  mode text not null, -- 'advice' | 'answer'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_math_help_threads_user on math_help_threads(user_id, updated_at desc);
