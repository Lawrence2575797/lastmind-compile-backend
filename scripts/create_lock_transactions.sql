-- Locks transaction ledger - previously every charge/credit just silently
-- adjusted lock_balances.balance with no record of why, making a real
-- usage question ("where did my Locks go") impossible to answer with
-- certainty after the fact. See src/services/lockService.ts's
-- recordTransaction - every spend/charge/credit now also writes one row
-- here alongside the balance update.
-- user_id is deliberately NULLABLE, not `not null` - accountDeletionService.ts
-- anonymizes this table on account deletion by setting user_id to null and
-- keeping the row (the audit trail outlives the account) - a not-null
-- constraint here made every one of those anonymize attempts fail outright
-- (found via a live deletion test after this table was first created with
-- the constraint mistakenly present).
create table if not exists lock_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  amount integer not null, -- negative = charge/spend, positive = credit/refund
  reason text not null, -- e.g. 'knowledge-map-v2-node-lesson', 'objective-course-plan', 'node-review-ao1-reword'
  model text, -- the Claude model used, when this charge came from a real API call
  balance_after integer not null,
  created_at timestamptz not null default now()
);
create index if not exists lock_transactions_user_id_created_at_idx on lock_transactions (user_id, created_at desc);
