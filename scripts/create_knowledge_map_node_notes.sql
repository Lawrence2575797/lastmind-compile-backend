-- Compiled study notes for one node's own encoding - generated once from
-- knowledge_map_node_lessons.encoding_content.explanation via Haiku (see
-- knowledgeMapNotesService.ts's compileNodeNotes), served identically to
-- every student who's encoded this node, never regenerated per student.
-- Same one-time-generation contract as knowledge_map_node_lessons itself.
create table knowledge_map_node_notes (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references knowledge_map_nodes(id) on delete cascade unique,
  notes_content text not null,
  generated_at timestamptz not null default now()
);

alter table knowledge_map_node_notes enable row level security;
