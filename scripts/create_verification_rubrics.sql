create table verification_rubrics (
  rubric_key text primary key,
  rubric jsonb not null,
  scenarios jsonb not null,
  -- Cache of generated structured follow-up items (fill-in-the-gap /
  -- order-the-words), keyed per specific gap/misconception so a later
  -- student hitting the exact same one reuses it instead of regenerating.
  follow_ups jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
