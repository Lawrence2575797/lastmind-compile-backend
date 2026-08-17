import { supabaseAdmin } from './supabaseAdmin';

// A student's tutee is the AI "student" they're teaching THROUGH an
// encoding lesson (see encodingLessonPrompts.ts's tutee-framed rewrite) —
// one per account, backend-synced (not local-only) since it's a real
// identity element the student names and will eventually give a
// character image to, not a throwaway device preference. Falls back to a
// generic default name for any account that hasn't customised one yet —
// never blocks a lesson from starting.
const DEFAULT_TUTEE_NAME = 'your tutee';
const MAX_NAME_LENGTH = 40;

export async function getTuteeName(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('user_tutees')
    .select('name')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return DEFAULT_TUTEE_NAME;
  return data.name || DEFAULT_TUTEE_NAME;
}

export async function setTuteeName(userId: string, name: string): Promise<string> {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  const finalName = trimmed || DEFAULT_TUTEE_NAME;
  const { error } = await supabaseAdmin
    .from('user_tutees')
    .upsert({ user_id: userId, name: finalName, updated_at: new Date().toISOString() });
  if (error) throw error;
  return finalName;
}
