create table lock_holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_event_id uuid not null references calendar_events(id) on delete cascade,
  amount integer not null,
  status text not null, -- 'held' | 'refunded' | 'forfeited'
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table lock_holds enable row level security;
