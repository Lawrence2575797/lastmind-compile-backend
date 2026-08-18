create table tutoring_response_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references tutoring_sessions(id),
  response_id uuid references tutoring_responses(id),
  reporter_id uuid not null,
  reason text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);
create index idx_tutoring_response_reports_session on tutoring_response_reports(session_id);
