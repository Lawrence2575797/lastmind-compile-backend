create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_date date not null,
  type text not null, -- 'busy' | 'exam'
  start_time text, -- HH:MM, nullable
  end_time text, -- HH:MM, nullable
  folder_id text -- exam only; the client-generated folder id, not a DB foreign key
);

create index idx_calendar_events_user_date on calendar_events(user_id, event_date);
