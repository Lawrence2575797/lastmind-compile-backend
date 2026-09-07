-- A student's own hand-written notes for one node - entirely separate
-- from knowledge_map_node_notes (the shared, Haiku-compiled note every
-- student who's encoded this node sees identically). This is per-user,
-- never shared, never touches the Claude API - free text by default, or
-- a lightly structured template (question heading + body + an optional
-- hand-drawn diagram, saved from the same interactive diagram tool
-- practice questions use) the student fills in themselves.
create table knowledge_map_node_personal_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  node_id uuid not null references knowledge_map_nodes(id) on delete cascade,
  content jsonb not null,
  updated_at timestamptz not null default now(),
  unique (user_id, node_id)
);

alter table knowledge_map_node_personal_notes enable row level security;
