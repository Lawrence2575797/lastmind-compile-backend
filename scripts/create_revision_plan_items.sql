create table revision_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  exam_event_id uuid not null references calendar_events(id),
  concept_id text not null,
  concept_label text not null,
  scheduled_date date not null,
  estimated_minutes integer not null,
  item_type text not null default 'concept', -- concept | exam_practice
  status text not null default 'pending', -- pending | done | skipped
  created_at timestamptz not null default now()
);

create index idx_revision_plan_items_user_date on revision_plan_items(user_id, scheduled_date);
create index idx_revision_plan_items_exam on revision_plan_items(exam_event_id);
