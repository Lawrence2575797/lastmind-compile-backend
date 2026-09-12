-- Step 1 of building a real account-deletion feature (see
-- PRIVACY_DATA_HANDLING.md's "Concrete blocker found while scoping this"
-- section for the full audit this migration is the fix for). Found via a
-- sweep of every scripts/create_*.sql/alter_*.sql file: these 13 tables
-- define user_id with NO foreign-key constraint to auth.users(id) at all,
-- meaning deleting a Supabase Auth user today leaves their rows in every
-- one of these tables permanently orphaned rather than cleaned up.
--
-- Every table here is genuinely fine to hard-delete outright on account
-- deletion (personal notes, settings, calendar events, generation-event
-- logs, tutoring/tutee profile rows) - none of them are a historical
-- record anyone else depends on. Two tables that WOULD otherwise be in
-- this list are deliberately excluded: lock_transactions and
-- credit_transactions are append-only financial ledgers, not per-user
-- state - cascading a hard delete on those would erase real transaction
-- history rather than just disconnect it from the (deleted) identity.
-- Those two need an explicit anonymization step (blank user_id, keep the
-- transaction) as part of the actual deletion ROUTE once it's built, not
-- a schema-level cascade - left for that follow-up work, not this
-- migration.
--
-- Two more tables (concept_reviews - the FSRS review history - and
-- whichever table folder-sync data lives in) predate this repo's
-- migration-script convention and couldn't be checked from code at all;
-- their real FK status needs confirming directly in the Supabase
-- dashboard before an actual deletion route is built on top of this.
alter table answer_confidence_signals add constraint answer_confidence_signals_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table calendar_events add constraint calendar_events_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table fresh_generation_events add constraint fresh_generation_events_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table knowledge_map_edge_notes_unlocked add constraint knowledge_map_edge_notes_unlocked_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table knowledge_map_node_personal_notes add constraint knowledge_map_node_personal_notes_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table math_help_threads add constraint math_help_threads_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table personal_general_notes add constraint personal_general_notes_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table revision_plan_items add constraint revision_plan_items_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table study_settings add constraint study_settings_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table theme_settings add constraint theme_settings_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table tutoring_profiles add constraint tutoring_profiles_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table user_credits add constraint user_credits_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table user_tutees add constraint user_tutees_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

-- The two excluded ledgers (see comment above) get user_id made nullable
-- instead of a cascade FK - accountDeletionService.ts sets it to null
-- explicitly on account deletion (anonymize, don't erase the transaction
-- row itself), which needs the column to actually accept null first.
alter table lock_transactions alter column user_id drop not null;
alter table credit_transactions alter column user_id drop not null;
