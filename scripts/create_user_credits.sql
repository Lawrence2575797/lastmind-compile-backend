create table user_credits (
  user_id uuid primary key,
  balance integer not null default 0,
  updated_at timestamptz not null default now()
);

create table credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount integer not null, -- positive = earned/granted, negative = spent
  reason text not null, -- e.g. 'signup_bonus', 'tutoring_response', 'help_request'
  created_at timestamptz not null default now()
);

create index idx_credit_transactions_user on credit_transactions(user_id, created_at);
