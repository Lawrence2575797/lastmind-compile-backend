-- Batch-generated content (see scripts/generate_knowledge_map.js, run from
-- the founder's own Claude Code sessions, not live per-student generation)
-- - one row per atomic micro-concept in a subject's dependency graph.
-- concept_id follows the exact same normalizeConceptKey(subject, topic,
-- concept) convention already used by concept_reviews/practice_questions
-- (chainService.ts) - topic is the node's subtopic (e.g. "3.2 Business
-- objectives"), concept is its full label - so FSRS reviews and this
-- table's rows resolve to each other the same way practice questions
-- already do, with no separate mapping table needed.
create table knowledge_map_nodes (
  id uuid primary key default gen_random_uuid(),
  concept_id text not null unique,
  subject text not null,
  qualification text not null,
  exam_board text not null,
  -- the generator's own short id (e.g. "B3") - stable across
  -- regenerations, used only to resolve edges below, never shown to a
  -- student (label is what the UI displays).
  node_key text not null,
  label text not null,
  subtopic text not null,
  theme text,
  created_at timestamptz not null default now(),
  unique (subject, qualification, exam_board, node_key)
);

create index idx_knowledge_map_nodes_subject on knowledge_map_nodes(subject, qualification, exam_board);
alter table knowledge_map_nodes enable row level security;
