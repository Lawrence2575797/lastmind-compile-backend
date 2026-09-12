import { supabaseAdmin } from './supabaseAdmin';

// Groundwork for the overnight spec's "global chain lessons" feature - see
// scripts/create_pairwise_integration_streaks.sql and
// OVERNIGHT_SPEC_STATUS.md's "Chain-lesson scoping" section for the full
// design this is one deliberately small, additive piece of. Nothing reads
// this table yet to gate or unlock anything - it only records the data a
// later pass needs (3 successive first-time-correct to start a pairwise
// chain link counting toward mastery, 2 to extend an existing chain).
//
// Called from POST /knowledge-map-v2/node-review/integration/submit,
// right after a graded integration answer is finalized - never touches
// concept_reviews, FSRS scheduling, or any existing due/gating check.
export async function recordPairwiseIntegrationOutcome(
  userId: string,
  fromConceptId: string,
  toConceptId: string,
  firstAttemptCorrect: boolean
): Promise<void> {
  try {
    if (!firstAttemptCorrect) {
      const { error } = await supabaseAdmin
        .from('pairwise_integration_streaks')
        .upsert(
          { user_id: userId, from_concept_id: fromConceptId, to_concept_id: toConceptId, streak_count: 0, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,from_concept_id,to_concept_id' }
        );
      if (error) throw error;
      return;
    }

    // Read-then-write, not a raw SQL increment - a real but low-stakes
    // race (two near-simultaneous submits for the SAME link, which a
    // single student can't realistically trigger outside a double-click/
    // multi-tab edge case) would at worst under-count by one, delaying a
    // future chain-unlock threshold by one extra correct answer, never
    // granting one early or corrupting FSRS/grading in any way.
    const { data: existing, error: readError } = await supabaseAdmin
      .from('pairwise_integration_streaks')
      .select('streak_count')
      .eq('user_id', userId)
      .eq('from_concept_id', fromConceptId)
      .eq('to_concept_id', toConceptId)
      .maybeSingle();
    if (readError) throw readError;

    const nextCount = (existing?.streak_count ?? 0) + 1;
    const { error: writeError } = await supabaseAdmin
      .from('pairwise_integration_streaks')
      .upsert(
        { user_id: userId, from_concept_id: fromConceptId, to_concept_id: toConceptId, streak_count: nextCount, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,from_concept_id,to_concept_id' }
      );
    if (writeError) throw writeError;
  } catch (err) {
    // Never let this block or fail the actual grading response it's
    // called from - this is forward-looking bookkeeping for a feature
    // that doesn't exist yet, not something a student's real review
    // should ever be blocked on.
    console.error('Pairwise integration streak tracking failed:', err);
  }
}
