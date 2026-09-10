// Text-to-speech for language-subject content (Italian/Spanish lesson
// explanations, listening questions) via ElevenLabs - a real API key and
// per-language voice id are required (see voiceIdForSubject below), never
// hardcoded here. Every clip is cached in the tts_cache table keyed by
// (voiceId, text) - a node/edge lesson's own explanation is generated once
// and served to every student (see lessonGenerationPrompts.ts's own
// comment on that), and this mirrors it: ElevenLabs is only ever billed
// once per unique phrase, not once per play or per student.
import crypto from 'crypto';
import { supabaseAdmin } from './supabaseAdmin';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// One voice id per subject, set via env vars rather than hardcoded here -
// add a new SUBJECT: process.env.ELEVENLABS_VOICE_ID_SUBJECT entry to
// support another language, no code change needed beyond this map.
const VOICE_IDS: Record<string, string | undefined> = {
  Italian: process.env.ELEVENLABS_VOICE_ID_ITALIAN,
  Spanish: process.env.ELEVENLABS_VOICE_ID_SPANISH,
};

export function voiceIdForSubject(subject: string): string | null {
  return VOICE_IDS[subject] || null;
}

function cacheKey(voiceId: string, text: string): string {
  return crypto.createHash('sha256').update(`${voiceId}:${text}`).digest('hex');
}

export interface SynthesizedAudio {
  audio: Buffer;
  contentType: string;
}

/**
 * Returns null when this subject has no configured voice (caller should
 * fall back to on-device speech), throws on a genuine API/config failure.
 */
export async function synthesizeSpeech(subject: string, text: string): Promise<SynthesizedAudio | null> {
  const voiceId = voiceIdForSubject(subject);
  if (!voiceId) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const key = cacheKey(voiceId, trimmed);
  const { data: cached, error: cacheReadError } = await supabaseAdmin
    .from('tts_cache')
    .select('audio_base64, content_type')
    .eq('cache_key', key)
    .maybeSingle();
  if (cacheReadError) throw cacheReadError;
  if (cached) {
    return { audio: Buffer.from(cached.audio_base64 as string, 'base64'), contentType: cached.content_type as string };
  }

  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY is not set.');
  }

  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    // eleven_flash_v2_5 - the cheapest/fastest ElevenLabs model, billed at
    // a fraction of a standard model's per-character rate - fine for
    // short vocabulary words/phrases where latency and cost matter far
    // more than the last bit of expressive nuance a full model offers.
    body: JSON.stringify({
      text: trimmed,
      model_id: 'eleven_flash_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`ElevenLabs TTS request failed (${resp.status}): ${errText}`);
  }
  const audio = Buffer.from(await resp.arrayBuffer());
  const contentType = 'audio/mpeg';

  // Best-effort cache write - awaited (not fire-and-forget) so a process
  // exit doesn't silently skip it, but its own failure never breaks the
  // response the student is actually waiting on.
  try {
    await supabaseAdmin.from('tts_cache').insert({ cache_key: key, audio_base64: audio.toString('base64'), content_type: contentType });
  } catch (err) {
    console.error('LastMind: failed to cache TTS audio (will regenerate next time).', err);
  }

  return { audio, contentType };
}
