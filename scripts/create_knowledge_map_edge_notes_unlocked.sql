-- Per-student marker: has THIS student unlocked this edge's compiled notes
-- (knowledge_map_edge_notes, shared/global content)? Needed because a
-- node's own "have I encoded this" is already answerable from existing
-- concept_reviews (joined by concept_id), but integration's submit route
-- grades every attempt immediately, right or wrong, so a concept_reviews
-- row existing there doesn't mean the student ever actually passed it.
-- Written by compileEdgeNotes the moment the frontend calls it after a
-- genuine identify+integration pass (see renderNodeReviewSummary's own
-- comment in learn/index.html) - this table alone decides whether a link
-- shows up on this student's own Notes page.
create table knowledge_map_edge_notes_unlocked (
  user_id uuid not null,
  edge_id uuid not null references knowledge_map_edges(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, edge_id)
);

alter table knowledge_map_edge_notes_unlocked enable row level security;
