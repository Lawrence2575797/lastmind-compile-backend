create table user_onboarding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seen_free_tour boolean not null default false,
  seen_premium_tour boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table user_onboarding enable row level security;
