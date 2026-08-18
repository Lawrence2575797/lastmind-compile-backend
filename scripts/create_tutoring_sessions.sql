create table tutoring_sessions (
  id uuid primary key default gen_random_uuid(),
  help_request_id uuid not null references help_requests(id),
  requester_id uuid not null,
  helper_id uuid not null,
  concept_id text not null,
  status text not null default 'assigned',
  assigned_at timestamptz not null default now(),
  deadline timestamptz not null,
  scheduled_time timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_tutoring_sessions_requester on tutoring_sessions(requester_id);
create index idx_tutoring_sessions_helper on tutoring_sessions(helper_id);
