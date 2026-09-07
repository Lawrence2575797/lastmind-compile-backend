-- A student's own free-standing notes with no lesson/subject behind them
-- at all - entirely separate from knowledge_map_node_personal_notes
-- (which is always tied to a real knowledge_map_nodes row). This lets a
-- student write something on the Notes page without ever having added a
-- subject, e.g. a general revision strategy or a cross-subject thought.
-- Same free-text/template shape as a node's own personal note, plus a
-- `title` a node's note never needs - a node already has its own label
-- to show as the header, a general note has nothing else to identify it
-- by in the sidebar list.
create table personal_general_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null default 'Untitled note',
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table personal_general_notes enable row level security;
