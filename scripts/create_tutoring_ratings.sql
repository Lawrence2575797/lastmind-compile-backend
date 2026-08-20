create table tutoring_ratings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references tutoring_sessions(id),
  rater_id uuid not null,
  ratee_id uuid not null,
  quality smallint not null check (quality between 1 and 5),
  helpfulness smallint not null check (helpfulness between 1 and 5),
  timeliness smallint not null check (timeliness between 1 and 5),
  clarity smallint not null check (clarity between 1 and 5),
  would_recommend smallint not null check (would_recommend between 1 and 5),
  created_at timestamptz not null default now(),
  unique(session_id)
);
create index idx_tutoring_ratings_ratee on tutoring_ratings(ratee_id);
