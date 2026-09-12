-- The first-time subject-picker wizard (separate from the existing
-- seen_free_tour/seen_premium_tour product-tour flags this table already
-- tracks) needs its own persistent "have they done this" flag - relying on
-- "does this account have zero folders" instead would be wrong the moment
-- a student deletes their only folder, which would silently re-trigger the
-- wizard for an existing account.
alter table user_onboarding add column if not exists completed_subject_picker boolean not null default false;
