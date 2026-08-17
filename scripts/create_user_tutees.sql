create table user_tutees (
  user_id uuid primary key,
  name text not null default 'Tutee',
  updated_at timestamptz not null default now()
);
