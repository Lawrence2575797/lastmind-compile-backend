-- Founder tutoring booking calendar - see src/services/tutoringSlotsService.ts.
-- One shared table: the founder creates 'open' slots (and can mark any of
-- them 'blocked' when busy, e.g. with uni work), students claim an 'open'
-- one after paying. No external calendar sync - the founder is the only
-- supplier, so he manages his own availability directly here rather than
-- through a synced Google/Outlook calendar.
create table if not exists tutoring_slots (
  id uuid primary key default gen_random_uuid(),
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'open' check (status in ('open', 'blocked', 'booked')),
  booked_name text,
  booked_email text,
  booked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tutoring_slots_start_time_idx on tutoring_slots (start_time);
