create table theme_settings (
  user_id uuid primary key,
  text_color text not null default '#E6D7B0',
  panel_color text not null default '#4E1B26',
  bg_color text not null default '#D9C398',
  bg_texture text not null default 'wood',
  updated_at timestamptz not null default now()
);
