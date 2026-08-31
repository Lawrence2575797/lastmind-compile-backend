-- The ENCODING lesson for one atomic node - generated once, served
-- identically to every student who clicks that node (never regenerated
-- per user or per click; that is what makes this a one-time content cost
-- rather than a live per-request one). What's actually per-student is the
-- FSRS review state in concept_reviews, keyed by knowledge_map_nodes'
-- concept_id, not this table.
create table knowledge_map_node_lessons (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references knowledge_map_nodes(id) on delete cascade unique,
  -- teaching content + the initial practice question(s) for this concept
  -- alone, shaped however the encoding lesson renderer expects.
  encoding_content jsonb not null,
  generated_at timestamptz not null default now()
);

alter table knowledge_map_node_lessons enable row level security;
