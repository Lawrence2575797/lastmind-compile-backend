create table math_help_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references math_help_threads(id) on delete cascade,
  role text not null, -- 'assistant' | 'user'
  content text not null,
  created_at timestamptz not null default now()
);

create index idx_math_help_messages_thread on math_help_messages(thread_id, created_at);
