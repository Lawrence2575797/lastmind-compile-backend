create table tutoring_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references tutoring_sessions(id),
  helper_id uuid not null,
  body text not null,
  raw_body text,
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_tutoring_responses_session on tutoring_responses(session_id);
