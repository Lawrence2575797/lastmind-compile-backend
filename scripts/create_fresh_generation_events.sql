create table fresh_generation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz not null default now()
);

create index fresh_generation_events_user_created_idx
  on fresh_generation_events (user_id, created_at desc);
