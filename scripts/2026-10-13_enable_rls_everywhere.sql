-- Turn on row level security for EVERY table in the public schema.
--
-- Why this is safe: all three backends (compile, stripe, webhook) talk to the database with the service-role key,
-- which bypasses RLS, and the website itself only ever uses Supabase for sign-in (it never reads a table directly).
-- With RLS on and no policies, the public "anon" and signed-in "authenticated" keys can read and write nothing,
-- so nobody can pull rows straight out of the database with the key that is visible in the page.
-- Re-running it is harmless.

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and rowsecurity = false loop
    execute format('alter table public.%I enable row level security', t.tablename);
    raise notice 'RLS enabled on %', t.tablename;
  end loop;
end $$;

-- Check: every row here should say true.
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by rowsecurity, tablename;
