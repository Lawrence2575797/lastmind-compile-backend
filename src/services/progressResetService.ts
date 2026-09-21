import { supabaseAdmin } from './supabaseAdmin';

// Deletes a user's saved spaced-repetition state, AND every note tied to
// those concepts, for a set of concepts — called when a page/subfolder/
// folder is deleted (see learn/index.html's deleteFolder), so a concept
// that gets re-taught later starts from a genuinely blank schedule instead
// of silently keeping its old FSRS state or personal notes under the hood.
// `concept_id` (on concept_reviews) is a known mix of raw labels
// (atomic-path testing) and normalized "subject:topic:concept" keys
// (chain-level tracking) — see chainService.ts's normalizeConceptKey
// comment — so callers pass every candidate key format a concept could be
// stored under, not just one.
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

  // Personal notes and compiled-note edits are keyed by knowledge_map_nodes'
  // own `id`, not by concept_id directly - resolve node ids (and any edge
  // touching one of them) from the same concept keys first. A node/edge
  // outside knowledge-map-v2 entirely (nothing matches) just means these
  // three deletes affect zero rows, same "best-effort, never blocks the
  // real deletion" contract the caller already relies on.
  const { data: matchedNodes, error: nodeLookupError } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('id')
    .in('concept_id', keys);
  if (nodeLookupError) throw nodeLookupError;
  const nodeIds = (matchedNodes || []).map((n) => n.id as string);
  if (!nodeIds.length) return;

  const { error: personalNotesError } = await supabaseAdmin
    .from('knowledge_map_node_personal_notes')
    .delete()
    .eq('user_id', userId)
    .in('node_id', nodeIds);
  if (personalNotesError) throw personalNotesError;

  const { error: noteEditsError } = await supabaseAdmin
    .from('knowledge_map_node_note_edits')
    .delete()
    .eq('user_id', userId)
    .in('node_id', nodeIds);
  if (noteEditsError) throw noteEditsError;

  const { data: matchedEdges, error: edgeLookupError } = await supabaseAdmin
    .from('knowledge_map_edges')
    .select('id')
    .or(`from_node_id.in.(${nodeIds.join(',')}),to_node_id.in.(${nodeIds.join(',')})`);
  if (edgeLookupError) throw edgeLookupError;
  const edgeIds = (matchedEdges || []).map((e) => e.id as string);
  if (!edgeIds.length) return;

  const { error: edgeNoteEditsError } = await supabaseAdmin
    .from('knowledge_map_edge_note_edits')
    .delete()
    .eq('user_id', userId)
    .in('edge_id', edgeIds);
  if (edgeNoteEditsError) throw edgeNoteEditsError;

  const { error: edgeUnlockError } = await supabaseAdmin
    .from('knowledge_map_edge_notes_unlocked')
    .delete()
    .eq('user_id', userId)
    .in('edge_id', edgeIds);
  if (edgeUnlockError) throw edgeUnlockError;
}

// Deleting a whole subject: every concept of that subject's knowledge map loses this user's progress, not just the ones the local folder
// happens to list as pages. A map-based subject stores no pages, so the page-based reset alone left its schedule, Day-1 checks and recalls
// behind (a deleted-then-recreated subject came back with its old reviews).
export async function resetSubjectProgress(userId: string, subject: string, qualification: string, examBoard: string): Promise<number> {
  const conceptIds: string[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabaseAdmin.from('knowledge_map_nodes').select('concept_id').eq('subject', subject);
    if (qualification) q = q.eq('qualification', qualification);
    if (examBoard) q = q.eq('exam_board', examBoard);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw error;
    (data || []).forEach((r) => conceptIds.push(r.concept_id as string));
    if (!data || data.length < 1000) break;
  }
  for (let i = 0; i < conceptIds.length; i += 100) {
    const keys = conceptIds.slice(i, i + 100);
    await resetConceptProgress(userId, keys);
    for (const [table, column] of [['day1_checks', 'concept_id'], ['immediate_recall_schedule', 'concept_id'], ['answer_confidence_signals', 'concept_id']] as const) {
      const { error } = await supabaseAdmin.from(table).delete().eq('user_id', userId).in(column, keys);
      if (error) throw error;
    }
    for (const column of ['from_concept_id', 'to_concept_id']) {
      const { error } = await supabaseAdmin.from('pairwise_integration_streaks').delete().eq('user_id', userId).in(column, keys);
      if (error) throw error;
    }
  }
  return conceptIds.length;
}
