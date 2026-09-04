-- Compiled transfer+integration notes for one edge - generated once from
-- knowledge_map_edge_lessons.link_teaching_content via Haiku (see
-- knowledgeMapNotesService.ts's compileEdgeNotes), served identically to
-- every student who's unlocked this link (see
-- knowledge_map_edge_notes_unlocked below), never regenerated per student.
-- transfer_summary is the one-sentence causal link (the same bar
-- LINK_IDENTIFY_GRADE_PROMPT already grades to); integration_summary is
-- the fuller mechanism explanation shown below it.
create table knowledge_map_edge_notes (
  id uuid primary key default gen_random_uuid(),
  edge_id uuid not null references knowledge_map_edges(id) on delete cascade unique,
  transfer_summary text not null,
  integration_summary text not null,
  generated_at timestamptz not null default now()
);

alter table knowledge_map_edge_notes enable row level security;
