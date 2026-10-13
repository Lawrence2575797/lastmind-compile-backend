-- generation_failures was the only table in scripts/ created without row level security.
-- Rows are only ever read and written by the backend through the service-role key, so no policy is needed: enabling RLS with no policies blocks the public (anon) key entirely.
alter table if exists generation_failures enable row level security;

-- Run this to list every table in the public schema that still has RLS off (should return no rows):
-- select tablename from pg_tables where schemaname = 'public' and rowsecurity = false;
