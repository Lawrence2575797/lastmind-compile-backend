-- Founder tutoring booking calendar - see src/services/tutoringSlotsService.ts.
-- Every day is OPEN by default within the fixed daily working-hours
-- template (see DAY_START_HOUR/DAY_END_HOUR in that file) - this table
-- only stores EXCEPTIONS (a slot the founder has blocked, or one a
-- student has booked), keyed by its exact start_time. A given calendar
-- date/time with no row here is simply open. This is what makes "every
-- day free by default, block the odd one out" and "this can differ every
-- week" both true with no extra bookkeeping - blocking one Tuesday never
-- touches any other Tuesday.
create table if not exists tutoring_slot_overrides (
  start_time timestamptz primary key,
  end_time timestamptz not null,
  status text not null check (status in ('blocked', 'booked')),
  booked_name text,
  booked_email text,
  booked_at timestamptz,
  created_at timestamptz not null default now()
);
