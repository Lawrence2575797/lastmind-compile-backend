create table study_settings (
  user_id uuid primary key,
  daily_minutes_budget integer not null default 90,
  updated_at timestamptz not null default now()
);
