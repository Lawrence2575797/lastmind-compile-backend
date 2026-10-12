-- Notes per account (not per device): one row per folder / page / problem set in the Notes sidebar,
-- and one row per picture added to a page. Rows are only read and written by the compile backend
-- through the service-role key, on behalf of the signed-in user.
create table if not exists user_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  node_id text not null,
  data jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, node_id)
);

create table if not exists user_note_images (
  user_id uuid not null references auth.users(id) on delete cascade,
  image_id text not null,
  data_url text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, image_id)
);

alter table user_notes enable row level security;
alter table user_note_images enable row level security;
