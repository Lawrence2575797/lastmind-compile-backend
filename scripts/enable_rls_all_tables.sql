-- Defense-in-depth hardening: enables Row Level Security on every table,
-- with NO policies attached. Every backend in this project (compile,
-- stripe, webhook) accesses Supabase exclusively via the service-role
-- key, which bypasses RLS entirely regardless of policies — so this
-- changes nothing for how the app currently works. What it DOES do: it
-- guarantees that if the anon/public key were ever accidentally used for
-- one of these tables (a future bug, a stray direct-from-browser Supabase
-- call), that access would be denied by default instead of silently
-- working. Safe to run against a live database with real data.

alter table calendar_events enable row level security;
alter table chain_lesson_progress enable row level security;
alter table concept_reviews enable row level security;
alter table dependency_chains enable row level security;
alter table encoding_diagrams enable row level security;
alter table encoding_lesson_content enable row level security;
alter table encoding_lesson_pending enable row level security;
alter table exam_spec_outlines enable row level security;
alter table help_requests enable row level security;
alter table review_log enable row level security;
alter table revision_plan_items enable row level security;
alter table study_settings enable row level security;
alter table tutoring_profiles enable row level security;
alter table tutoring_ratings enable row level security;
alter table tutoring_response_reports enable row level security;
alter table tutoring_responses enable row level security;
alter table tutoring_sessions enable row level security;
alter table user_folders enable row level security;
alter table user_tutees enable row level security; -- orphaned table, code no longer references it, but it may still exist
alter table verification_rubrics enable row level security;
alter table subscriptions enable row level security; -- used by lastmind-stripe-backend, also service-role-only
alter table user_credits enable row level security;
alter table answer_confidence_signals enable row level security;
alter table lock_balances enable row level security;
alter table lock_holds enable row level security;
alter table learning_profile_entries enable row level security;
alter table user_onboarding enable row level security;
alter table math_help_threads enable row level security;
alter table math_help_messages enable row level security;
