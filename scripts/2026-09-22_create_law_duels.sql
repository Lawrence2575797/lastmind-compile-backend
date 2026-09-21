-- Two-player Law duels: one player takes the defence, the other the prosecution, each playing their own side of the SAME
-- compiled case on their own time. Only what is needed to compare the two performances is shared between them
-- (which facts each side drew out, and how persuasive the AI judged them). Run once in the Supabase SQL editor.
create table if not exists law_duels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  creator_id uuid not null references auth.users(id) on delete cascade,
  creator_side text not null check (creator_side in ('defence', 'prosecution')),
  opponent_id uuid references auth.users(id) on delete set null,
  title text not null,
  meta jsonb not null default '{}'::jsonb,       -- charge, briefing, the curriculum concepts the case teaches
  graph jsonb not null,                           -- the compiled Case Graph both players use
  creator_result jsonb,                           -- { established: [factIds], persuasion: -1..1, at }
  opponent_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_law_duels_creator on law_duels(creator_id);
create index if not exists idx_law_duels_opponent on law_duels(opponent_id);
alter table law_duels enable row level security;   -- reached only through the backend (service role)
