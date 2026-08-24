create table lock_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null,
  period_start date not null,
  updated_at timestamptz not null default now()
);

alter table lock_balances enable row level security;
