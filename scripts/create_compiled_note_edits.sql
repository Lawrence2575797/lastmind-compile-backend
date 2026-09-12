-- Per-student edits to an auto-compiled note - see knowledgeMapNotesService.ts.
-- The compiled note ITSELF is no longer stored (it's cheap to recompute
-- live from the lesson's own cached explanation/link-teaching text via a
-- plain text filter, no AI call), so only a student's own edit needs a
-- durable row: when one exists, it replaces the live-filtered baseline;
-- when it doesn't, the baseline is shown as-is. Same per-user, never-
-- shared, never-touches-Claude shape as knowledge_map_node_personal_notes.
create table if not exists knowledge_map_node_note_edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  node_id uuid not null references knowledge_map_nodes(id) on delete cascade,
  paragraphs jsonb not null,
  updated_at timestamptz not null default now(),
  unique (user_id, node_id)
);
alter table knowledge_map_node_note_edits enable row level security;

create table if not exists knowledge_map_edge_note_edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  edge_id uuid not null references knowledge_map_edges(id) on delete cascade,
  paragraphs jsonb not null,
  updated_at timestamptz not null default now(),
  unique (user_id, edge_id)
);
alter table knowledge_map_edge_note_edits enable row level security;
