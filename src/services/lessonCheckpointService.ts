import { supabaseAdmin } from './supabaseAdmin';

export type LessonType = 'encoding' | 'chain';

// Mid-lesson resume state, keyed by (user, lesson type, concept). One row
// per concept a student currently has an unfinished attempt on — cleared
// the moment that attempt finishes (see clearCheckpoint), so a row's mere
// existence means "resumable", not "ever started".
export async function loadCheckpoint<T>(userId: string, lessonType: LessonType, conceptKey: string): Promise<T | null> {
  const { data, error } = await supabaseAdmin
    .from('lesson_checkpoints')
    .select('state')
    .eq('user_id', userId)
    .eq('lesson_type', lessonType)
    .eq('concept_key', conceptKey)
    .maybeSingle();

  if (error) throw error;
  return (data?.state as T) ?? null;
}

export async function saveCheckpoint(userId: string, lessonType: LessonType, conceptKey: string, state: unknown): Promise<void> {
  const { error } = await supabaseAdmin
    .from('lesson_checkpoints')
    .upsert(
      { user_id: userId, lesson_type: lessonType, concept_key: conceptKey, state, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,lesson_type,concept_key' }
    );

  if (error) throw error;
}

export async function clearCheckpoint(userId: string, lessonType: LessonType, conceptKey: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('lesson_checkpoints')
    .delete()
    .eq('user_id', userId)
    .eq('lesson_type', lessonType)
    .eq('concept_key', conceptKey);

  if (error) throw error;
}
