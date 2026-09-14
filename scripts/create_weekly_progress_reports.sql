-- One row per (student, completed week) - a stable, "released" snapshot,
-- not a live-recomputed view. Generated lazily the first time a student
-- opens the Progress Report tab after their week has actually ended (see
-- weeklyProgressReportService.ts's getOrGenerateWeeklyReport - same
-- lazy-sweep convention this app already uses elsewhere, e.g.
-- lockService's monthly reset, since there's no cron infrastructure).
-- Computed entirely from review_log/concept_reviews/knowledge_map_nodes,
-- which the app already collects for every graded event - no new
-- personal data is gathered to build this, only a new personal SUMMARY
-- derived from data already being recorded (see the privacy policy
-- update alongside this).
create table weekly_progress_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null, -- Monday (UTC) of the reported week
  report_json jsonb not null,
  generated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index idx_weekly_progress_reports_user_id on weekly_progress_reports(user_id);
alter table weekly_progress_reports enable row level security;
