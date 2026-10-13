-- Football manager: multiplayer games played by game code (a shared league, or a one-off match between two managers).
-- Everything about a game lives in one row: who sits where, the round, each manager's submitted plan for the round, and the rounds already played.
create table if not exists football_games (
  code text primary key,
  kind text not null check (kind in ('league', 'match')),
  seed integer not null,
  run_seed integer not null,
  host_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_football_games_host on football_games(host_id);
alter table football_games enable row level security;
