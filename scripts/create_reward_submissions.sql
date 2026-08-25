-- Submissions from the public partner-signup form (lastmind-frontend's
-- /partner-signup page) — reviewed manually (this table's own Supabase
-- editor is enough, same philosophy as the `rewards` table itself), then
-- added to KEY_MARKET_REWARDS in learn/index.html by hand once approved.
-- Not wired into the live Key Market automatically.
create table reward_submissions (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_email text not null,
  title text not null,
  description text not null,
  terms text,
  category text,
  suggested_cost_keys integer,
  accent_color text,
  status text not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at timestamptz not null default now()
);

alter table reward_submissions enable row level security;
