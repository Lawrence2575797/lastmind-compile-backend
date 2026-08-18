create table tutoring_profiles (
  user_id uuid primary key,
  display_name text,
  tutoring_opt_in boolean not null default false,
  last_assigned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
