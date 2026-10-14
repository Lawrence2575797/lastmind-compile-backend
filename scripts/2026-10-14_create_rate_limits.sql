-- Shared rate limits for every Render instance. Safe to run repeatedly.
create table if not exists public.rate_limit_counters (
  namespace text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  reset_at timestamptz not null,
  hits integer not null check (hits >= 0),
  primary key (namespace, key_hash, window_started_at)
);
alter table public.rate_limit_counters enable row level security;

create or replace function public.rate_limit_increment(
  p_namespace text, p_key_hash text, p_window_seconds integer
) returns table(total_hits integer, reset_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz := clock_timestamp();
  v_start timestamptz;
begin
  if p_window_seconds < 1 or length(p_namespace) > 80 or length(p_key_hash) <> 64 then
    raise exception 'invalid rate-limit arguments';
  end if;
  v_start := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limit_counters as counter(namespace, key_hash, window_started_at, reset_at, hits)
  values (p_namespace, p_key_hash, v_start, v_start + make_interval(secs => p_window_seconds), 1)
  on conflict (namespace, key_hash, window_started_at)
  do update set hits = public.rate_limit_counters.hits + 1
  returning counter.hits, counter.reset_at into total_hits, reset_at;
  if random() < 0.01 then delete from public.rate_limit_counters where reset_at < v_now - interval '1 day'; end if;
  return next;
end $$;

create or replace function public.rate_limit_reset(p_namespace text, p_key_hash text)
returns void language sql security definer set search_path = public as $$
  delete from public.rate_limit_counters where namespace = p_namespace and key_hash = p_key_hash;
$$;

revoke all on table public.rate_limit_counters from anon, authenticated;
revoke all on function public.rate_limit_increment(text,text,integer) from public, anon, authenticated;
revoke all on function public.rate_limit_reset(text,text) from public, anon, authenticated;
grant execute on function public.rate_limit_increment(text,text,integer) to service_role;
grant execute on function public.rate_limit_reset(text,text) to service_role;
