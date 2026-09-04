-- Caches the taught-order permutation of a subtopic's atomic concept
-- nodes for the Notes page's sidebar tree (see
-- knowledgeMapNotesService.ts's getOrComputeSubtopicOrder). Node creation
-- order isn't recoverable (knowledge_map_nodes has no rank column and its
-- rows are bulk-inserted with a shared created_at per chunk - see
-- ingest_knowledge_map.js), so this is computed once per subtopic via a
-- cheap model call grounded in exam_spec_outlines' own microtopics
-- breakdown where one exists, then cached here - global/shared across
-- every student, same one-time-generation contract as the notes tables
-- themselves.
create table knowledge_map_node_spec_order (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  qualification text not null,
  exam_board text not null,
  subtopic text not null,
  node_order jsonb not null, -- ordered array of knowledge_map_nodes.id (uuid strings)
  generated_at timestamptz not null default now(),
  unique (subject, qualification, exam_board, subtopic)
);
alter table knowledge_map_node_spec_order enable row level security;
