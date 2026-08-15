import { supabaseAdmin } from './supabaseAdmin';

// Deletes a user's saved spaced-repetition state for a set of concepts —
// called when a page/subfolder/folder is deleted, so a concept that gets
// re-taught later starts from a genuinely blank schedule instead of
// silently keeping its old FSRS state under the hood. `concept_id` (on
// concept_reviews) is a known mix of raw labels (atomic-path testing) and
// normalized "subject:topic:concept" keys (chain-level tracking) — see
// chainService.ts's normalizeConceptKey comment — so callers pass every
// candidate key format a concept could be stored under, not just one.
export async function resetConceptProgress(userId: string, conceptKeys: string[]): Promise<void> {
  const keys = [...new Set(conceptKeys.filter((k) => typeof k === 'string' && k.trim()))];
  if (!keys.length) return;

  const { error: reviewError } = await supabaseAdmin
    .from('concept_reviews')
    .delete()
    .eq('user_id', userId)
    .in('concept_id', keys);
  if (reviewError) throw reviewError;

  const { error: progressError } = await supabaseAdmin
    .from('chain_lesson_progress')
    .delete()
    .eq('user_id', userId)
    .in('concept_key', keys);
  if (progressError) throw progressError;

  // Also drop any in-progress lesson checkpoint (see
  // lessonCheckpointService.ts) for these concepts — otherwise a re-taught
  // concept's next /start could resume a stale, now-irrelevant mid-lesson
  // session instead of genuinely starting fresh. Not scoped to a single
  // lesson_type: the concept is being wiped entirely, so both an unfinished
  // encoding attempt and an unfinished chain/retrieval attempt (however
  // unlikely to coexist) should go.
  const { error: checkpointError } = await supabaseAdmin
    .from('lesson_checkpoints')
    .delete()
    .eq('user_id', userId)
    .in('concept_key', keys);
  if (checkpointError) throw checkpointError;
}
