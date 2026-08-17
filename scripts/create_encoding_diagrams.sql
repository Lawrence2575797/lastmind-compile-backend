create table encoding_diagrams (
  diagram_key text primary key,
  diagram jsonb,
  created_at timestamptz not null default now()
);
