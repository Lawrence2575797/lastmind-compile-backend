// The Bayesian recall-scheduling model - Rs/C/D/beta/gamma, per the
// user's own spec (recorded verbatim in the session that built this).
// Three formulas, all working together but each independently testable:
//
//   Rs = Rb,o + beta(D - C)   - how many successful recalls this
//                               particular concept-encounter needs before
//                               it "graduates" to the Day-1 check.
//   C  = (1/n) sum(Di * Ri)   - the student's current capability, from
//                               their direct prerequisites' own difficulty
//                               and FSRS retrievability.
//   t  = Tb - gamma(D - C)    - how long to wait before the NEXT recall,
//                               adjusted from the fixed baseline interval
//                               by how much harder/easier this concept is
//                               than the student's current capability.
//
// Rb,o (base_recalls) and beta start at defaults (2 and 0) and are
// intended to personalize over time from real Day-1 outcomes - beta=0
// means the model behaves EXACTLY like the old fixed schedule until
// there's enough data to justify moving it, per explicit instruction.
// gamma has its own separate, faster-moving hill-climbing update (see
// updateGammaAfterRecall) since it's tuned from every recall, not just
// Day-1 outcomes.
import { supabaseAdmin } from './supabaseAdmin';
import { retrievability, rowToCard, ConceptReviewRow } from './fsrsService';

export interface UserRecallTuning {
  user_id: string;
  base_recalls: number;
  beta: number;
  gamma: number;
  delta_gamma: number;
  gamma_direction: number; // 1 or -1
  last_recall_outcome: boolean | null;
}

// One row per student, global (not per-subject) - explicit instruction.
// Created lazily on first use rather than at signup, same "don't
// pre-provision state nothing has asked for yet" convention this app
// already uses elsewhere (e.g. concept_reviews itself).
export async function getOrCreateUserRecallTuning(userId: string): Promise<UserRecallTuning> {
  const { data: existing, error } = await supabaseAdmin
    .from('user_recall_tuning')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing as UserRecallTuning;

  const fresh: UserRecallTuning = {
    user_id: userId, base_recalls: 2, beta: 0, gamma: 0, delta_gamma: 0.1, gamma_direction: 1, last_recall_outcome: null,
  };
  // Upsert, not insert - two near-simultaneous first-ever recalls for the
  // same brand-new student could both reach here; onConflict makes the
  // race harmless instead of a duplicate-key error.
  const { error: upsertError } = await supabaseAdmin.from('user_recall_tuning').upsert(fresh, { onConflict: 'user_id' });
  if (upsertError) throw upsertError;
  return fresh;
}

// C = (1/n) * sum(Di * Ri) across this node's direct prerequisites.
// Ri is real FSRS retrievability where a prerequisite has been reviewed
// at least once; per explicit instruction, when NONE of the prerequisites
// have any FSRS state yet (every one was only just encoded, never
// reviewed), C falls back to the SIMPLEST possible proxy - the highest
// difficulty among those prerequisites - rather than trying to average
// in a placeholder retrievability value for content there's genuinely no
// real signal on yet. A node with no prerequisites at all (a true root
// concept) has no meaningful "capability from prerequisites" signal -
// C defaults to 0, which reads as "assume nothing yet demonstrated",
// the conservative (more-recalls-required) direction.
export async function computeCapability(nodeId: string, userId: string): Promise<number> {
  const { data: incomingEdges, error: edgeError } = await supabaseAdmin
    .from('knowledge_map_edges')
    .select('from_node_id')
    .eq('to_node_id', nodeId);
  if (edgeError) throw edgeError;
  const prereqIds = Array.from(new Set((incomingEdges || []).map((e) => e.from_node_id as string)));
  if (!prereqIds.length) return 0;

  const { data: prereqNodes, error: nodeError } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('id, concept_id, difficulty')
    .in('id', prereqIds);
  if (nodeError) throw nodeError;
  const prereqs = (prereqNodes || []).filter((n) => typeof n.difficulty === 'number') as { id: string; concept_id: string; difficulty: number }[];
  if (!prereqs.length) return 0;

  const conceptIds = prereqs.map((n) => n.concept_id);
  const { data: reviewRows, error: reviewError } = await supabaseAdmin
    .from('concept_reviews')
    .select('*')
    .eq('user_id', userId)
    .in('concept_id', conceptIds);
  if (reviewError) throw reviewError;
  const reviewByConceptId = new Map((reviewRows || []).map((r) => [r.concept_id as string, r]));

  const now = new Date();
  const withRetrievability = prereqs.map((p) => {
    const row = reviewByConceptId.get(p.concept_id);
    if (!row) return null; // never reviewed at all - no real Ri
    return { difficulty: p.difficulty, r: retrievability(rowToCard(row as unknown as ConceptReviewRow), now) };
  });
  const known = withRetrievability.filter(Boolean) as { difficulty: number; r: number }[];

  if (known.length === prereqs.length) {
    // Every prerequisite has real FSRS state - the full weighted average.
    const sum = known.reduce((acc, p) => acc + p.difficulty * p.r, 0);
    return sum / known.length;
  }
  // At least one prerequisite has never been reviewed at all - fall back
  // to the simplest proxy across ALL prerequisites rather than a partial
  // average, per explicit instruction.
  return Math.max(...prereqs.map((p) => p.difficulty));
}

// Rs = Rb,o + beta(D - C), floored at 1 (a concept always needs at
// least one successful recall, per spec).
export function computeRequiredRecalls(difficulty: number, capability: number, tuning: UserRecallTuning): number {
  const raw = tuning.base_recalls + tuning.beta * (difficulty - capability);
  return Math.max(1, Math.round(raw));
}

// Tb sequence per spec: the immediate encoding question itself is
// recall #1 at 0 delay (already happened by the time this is ever
// called); recall #2 is the existing +2 minute check; #3/#4/#5 are
// 5/10/15 minutes. Rs demanding MORE than 5 total recalls (harder than
// the explicitly-specified schedule covers) isn't addressed in the spec
// - doubling each further interval is my own reasonable extrapolation
// of the same expanding-gap pattern, not something explicitly asked
// for; flag for correction if a different rule is wanted.
const TB_MINUTES_BY_RECALL_NUMBER: Record<number, number> = { 1: 2, 2: 5, 3: 10, 4: 15 };
function baselineIntervalMinutes(recallNumber: number): number {
  // recallNumber here is 1-indexed against SCHEDULED recalls (the
  // existing immediate_recall_schedule.recall_number column) - recall
  // #1 is the +2 minute one, matching TB_MINUTES_BY_RECALL_NUMBER[1].
  if (TB_MINUTES_BY_RECALL_NUMBER[recallNumber]) return TB_MINUTES_BY_RECALL_NUMBER[recallNumber];
  const last = TB_MINUTES_BY_RECALL_NUMBER[4];
  const extraSteps = recallNumber - 4;
  return last * Math.pow(2, extraSteps);
}

// t = Tb - gamma(D - C) - harder-than-capability concepts get a SHORTER
// wait (recalled sooner, while more likely to be forgotten); easier
// concepts get a LONGER wait. Clamped to a sane floor (30 seconds) so a
// large gamma/difficulty-gap combination can never schedule a recall in
// the past or immediately re-fire.
export function nextRecallDelayMinutes(recallNumber: number, difficulty: number, capability: number, tuning: UserRecallTuning): number {
  const tb = baselineIntervalMinutes(recallNumber);
  const t = tb - tuning.gamma * (difficulty - capability);
  return Math.max(0.5, t);
}

// The gamma hill-climbing update, reverse-engineered from the worked
// example in the spec (+0.1, +0.1, -0.05, +0.025 for
// correct/correct/incorrect/correct): the step size and direction only
// change when the outcome DIFFERS from the immediately-previous one
// (a flip signals overshoot) - reverse direction and halve the step.
// Two consecutive identical outcomes just repeat the same move at the
// same step size. This is my own derivation of "the pattern" from those
// four numbers, not something spelled out as an explicit rule - flag
// for correction if a different reading was intended.
export async function updateGammaAfterRecall(userId: string, correctOnFirstTry: boolean): Promise<UserRecallTuning> {
  const tuning = await getOrCreateUserRecallTuning(userId);
  let { gamma, delta_gamma: deltaGamma, gamma_direction: direction } = tuning;
  const flipped = tuning.last_recall_outcome !== null && tuning.last_recall_outcome !== correctOnFirstTry;
  if (flipped) {
    direction = -direction;
    deltaGamma = deltaGamma / 2;
  }
  gamma = gamma + direction * deltaGamma;

  const updated: UserRecallTuning = { ...tuning, gamma, delta_gamma: deltaGamma, gamma_direction: direction, last_recall_outcome: correctOnFirstTry };
  const { error } = await supabaseAdmin
    .from('user_recall_tuning')
    .update({ gamma, delta_gamma: deltaGamma, gamma_direction: direction, last_recall_outcome: correctOnFirstTry, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw error;
  return updated;
}

// Rb <- Rb + 1 - the simpler operational rule explicitly chosen over
// estimating alpha from Ra/Rs directly. Fired only on a GENUINE Day-1
// failure (not a silly-mistake retry that then succeeds) - see
// day1CheckService's own submit handler for that distinction.
export async function bumpBaseRecalls(userId: string): Promise<void> {
  const tuning = await getOrCreateUserRecallTuning(userId);
  const { error } = await supabaseAdmin
    .from('user_recall_tuning')
    .update({ base_recalls: tuning.base_recalls + 1, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw error;
}
