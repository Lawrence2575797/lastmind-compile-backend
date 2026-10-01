-- Adds a nullable owner_user_id to knowledge_map_nodes so a Cortex-built
-- custom topic ('Other' qualification) can be tied back to the student who
-- generated it, without affecting any curated subject's rows (which stay
-- null forever - ownership only applies to custom topics).
alter table knowledge_map_nodes
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

create index if not exists knowledge_map_nodes_owner_user_id_idx
  on knowledge_map_nodes (owner_user_id)
  where owner_user_id is not null;
