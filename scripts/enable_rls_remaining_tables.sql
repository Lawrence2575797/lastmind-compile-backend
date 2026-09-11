-- Follow-up to enable_rls_all_tables.sql - these 5 tables were created
-- after that sweep (or otherwise missed it) and never got RLS enabled.
-- Same reasoning as that file: every backend accesses Supabase via the
-- service-role key only, which bypasses RLS regardless, so this changes
-- nothing about how the app works today - it just closes the gap where an
-- accidental anon/public-key call against one of these would otherwise
-- have silently worked instead of being denied by default.
alter table theme_settings enable row level security;
alter table tts_cache enable row level security;
alter table tutoring_slot_overrides enable row level security;
alter table fresh_generation_events enable row level security;
alter table lock_transactions enable row level security;
