-- The LINK-TEACHING, TRANSFER, and INTEGRATION content for one
-- prerequisite edge - these test the relationship between two nodes, not
-- either node alone, so they attach to the edge, not to a node. Same
-- one-time-generation contract as knowledge_map_node_lessons: built once
-- per edge, served identically to every student, never regenerated per
-- attempt. FSRS tracks transfer/integration mastery per student against
-- this row via a review key derived from the edge, mirroring how
-- encoding mastery is tracked per node.
create table knowledge_map_edge_lessons (
  id uuid primary key default gen_random_uuid(),
  edge_id uuid not null references knowledge_map_edges(id) on delete cascade unique,
  -- explains WHY the prerequisite -> dependent relationship holds, shown
  -- before the transfer question.
  link_teaching_content jsonb not null,
  -- the genuine transfer test - requires the prerequisite to answer,
  -- distinct from re-testing the prerequisite's own encoding.
  transfer_question jsonb not null,
  -- only ever shown after a transfer pass (see the slip-vs-genuine-
  -- failure distinction from the lesson-flow design) - tests both
  -- concepts together.
  integration_question jsonb not null,
  generated_at timestamptz not null default now()
);

alter table knowledge_map_edge_lessons enable row level security;
