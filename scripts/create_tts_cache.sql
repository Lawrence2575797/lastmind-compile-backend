-- ElevenLabs TTS cache - see src/services/elevenLabsService.ts. Keyed by
-- sha256(voiceId:text) so the same phrase is never re-synthesized (and
-- never re-billed) once any student has ever heard it. Audio is stored as
-- base64 text rather than bytea to sidestep PostgREST's own bytea
-- encoding, which the backend never needs to deal with directly.
create table if not exists tts_cache (
  cache_key text primary key,
  audio_base64 text not null,
  content_type text not null default 'audio/mpeg',
  created_at timestamptz not null default now()
);
