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
