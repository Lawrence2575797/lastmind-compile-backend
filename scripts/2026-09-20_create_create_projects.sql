-- LastMind Create: saved simulation projects (a creator's case, its compiled Case Graph and the result of a
-- playtest). "is_reference" marks a finished case that other creators can open as a worked example.
create table if not exists create_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'criminal-trial',
  title text not null,
  data jsonb not null,
  is_reference boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists create_projects_user_idx on create_projects(user_id, updated_at desc);
create index if not exists create_projects_reference_idx on create_projects(is_reference) where is_reference;
alter table create_projects enable row level security;
-- The backend uses the service role, which bypasses RLS; there are deliberately no client policies.
