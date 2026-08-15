-- Mid-lesson checkpointing: lets a student close the tab partway through a
-- lesson (encoding or spaced-repetition chain/retrieval) and resume at the
-- same question later, instead of the session existing only in browser
-- memory and being lost on reload. See lessonCheckpointService.ts.
--
-- Deliberately a NEW table rather than reviving the old, now-unused
-- chain_lesson_progress (see progressResetService.ts's comment and commit
-- 67b2d13) — that table stored a review-count scalar for a scaffold ramp
-- design that's since been replaced by FSRS stability/reps; its schema
-- doesn't fit a full session-state blob, and repurposing it would be
-- confusing given it's referenced elsewhere as the old thing.
--
-- Run this once against your Supabase project (SQL Editor, or `psql`) —
-- there is no migration runner wired up in this repo, so nothing applies
-- it automatically.
create table if not exists lesson_checkpoints (
  user_id uuid not null,
  lesson_type text not null check (lesson_type in ('encoding', 'chain')),
  concept_key text not null,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_type, concept_key)
);

-- Only ever read/written via supabaseAdmin (the service-role key), same as
-- concept_reviews/dependency_chains/etc. — RLS on with no policies blocks
-- the anon/authenticated client roles from touching it directly, since the
-- frontend never talks to Supabase for this data itself.
alter table lesson_checkpoints enable row level security;
