-- Long-term-learning Key economy. The RPC owns both the idempotent ledger
-- insert and balance increment so duplicate/retried HTTP submissions can
-- never award twice and concurrent rewards cannot overwrite each other.

alter table credit_transactions add column if not exists event_key text;
alter table credit_transactions add column if not exists concept_id text;
alter table credit_transactions add column if not exists reward_type text;
alter table credit_transactions add column if not exists balance_after integer;

create unique index if not exists credit_transactions_user_event_key_unique
  on credit_transactions(user_id, event_key)
  where event_key is not null;

create or replace function award_learning_keys(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_event_key text,
  p_concept_id text,
  p_reward_type text
)
returns table(awarded integer, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  new_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'Key award must be positive';
  end if;

  insert into user_credits(user_id, balance, updated_at)
  values (p_user_id, 0, now())
  on conflict (user_id) do nothing;

  insert into credit_transactions(user_id, amount, reason, event_key, concept_id, reward_type)
  values (p_user_id, p_amount, p_reason, p_event_key, p_concept_id, p_reward_type)
  on conflict (user_id, event_key) where event_key is not null do nothing
  returning id into inserted_id;

  if inserted_id is null then
    select uc.balance into new_balance from user_credits uc where uc.user_id = p_user_id;
    return query select 0, coalesce(new_balance, 0);
    return;
  end if;

  update user_credits
  set balance = user_credits.balance + p_amount,
      updated_at = now()
  where user_id = p_user_id
  returning user_credits.balance into new_balance;

  update credit_transactions
  set balance_after = new_balance
  where id = inserted_id;

  return query select p_amount, new_balance;
end;
$$;

revoke all on function award_learning_keys(uuid, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function award_learning_keys(uuid, integer, text, text, text, text) to service_role;

alter table user_credits enable row level security;
alter table credit_transactions enable row level security;

