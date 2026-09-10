-- Locks transaction ledger - previously every charge/credit just silently
-- adjusted lock_balances.balance with no record of why, making a real
-- usage question ("where did my Locks go") impossible to answer with
-- certainty after the fact. See src/services/lockService.ts's
-- recordTransaction - every spend/charge/credit now also writes one row
-- here alongside the balance update.
create table if not exists lock_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount integer not null, -- negative = charge/spend, positive = credit/refund
  reason text not null, -- e.g. 'knowledge-map-v2-node-lesson', 'objective-course-plan', 'node-review-ao1-reword'
  model text, -- the Claude model used, when this charge came from a real API call
  balance_after integer not null,
  created_at timestamptz not null default now()
);
create index if not exists lock_transactions_user_id_created_at_idx on lock_transactions (user_id, created_at desc);
