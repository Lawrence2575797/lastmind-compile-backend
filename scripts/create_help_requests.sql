create table help_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null,
  concept_id text not null,
  subject text not null,
  topic text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);
create index idx_help_requests_requester on help_requests(requester_id);
create index idx_help_requests_concept on help_requests(concept_id);
