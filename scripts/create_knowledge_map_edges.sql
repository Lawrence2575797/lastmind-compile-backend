-- Directed prerequisite edges between knowledge_map_nodes rows - the DAG
-- structure a generation run validates before being written (see
-- validate() in scripts/generate_knowledge_map.js). from_node_id must be
-- understood before to_node_id makes sense.
create table knowledge_map_edges (
  id uuid primary key default gen_random_uuid(),
  from_node_id uuid not null references knowledge_map_nodes(id) on delete cascade,
  to_node_id uuid not null references knowledge_map_nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (from_node_id, to_node_id)
);

create index idx_knowledge_map_edges_from on knowledge_map_edges(from_node_id);
create index idx_knowledge_map_edges_to on knowledge_map_edges(to_node_id);
alter table knowledge_map_edges enable row level security;
