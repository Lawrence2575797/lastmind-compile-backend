-- Saved diagrams for the standalone Economics Drawing Tool (see
-- economicsDiagramService.ts) - a personal gallery, separate from any
-- graded practice-question attempt. diagram_state mirrors exactly what
-- renderDiagramWidget's own onSubmit callback already produces
-- ({curves, shades, labels, arrows} with real drawn positions) - same
-- shape renderPersonalNoteEditor already persists for a note's own
-- diagram, just given its own gallery here instead of being tied to
-- one note.
create table economics_diagrams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  diagram_state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_economics_diagrams_user_id on economics_diagrams(user_id);
alter table economics_diagrams enable row level security;
