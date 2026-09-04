// The knowledge map's Notes page (see learn/index.html's openNotesPage) —
// compiled study notes generated straight from a node's/edge's own already-
// authored ground truth (encoding_content's explanation, link_teaching_content),
// never from a student's own answer. Node notes are earned once a node is
// encoded; edge (transfer+integration) notes are earned once a review
// session actually passes both the identify and integration checks for that
// link (see renderNodeReviewSummary's own comment in learn/index.html). Both
// are compiled ONCE per node/edge and shared across every student who's
// earned them — same one-time-generation contract as the underlying lesson
// content itself — via Haiku (MODELS.simpleQuestion), since turning
// already-written ground truth into a shorter note is a genuinely easy
// transform, not a task that needs a bigger model.
import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { parseModelJson } from './jsonParsing';
import { selectRowsByIdChunked } from './supabasePagination';
import { resolveEdgeForReview } from './nodeReviewService';
import { NODE_NOTES_COMPILE_PROMPT, EDGE_NOTES_COMPILE_PROMPT } from '../constants/knowledgeMapNotesPrompts';

export async function getNodeNotes(nodeId: string): Promise<{ notes: string } | null> {
  const { data } = await supabaseAdmin.from('knowledge_map_node_notes').select('notes_content').eq('node_id', nodeId).maybeSingle();
  return data ? { notes: data.notes_content as string } : null;
}

export async function compileNodeNotes(nodeId: string): Promise<{ notes: string } | null> {
  const cached = await getNodeNotes(nodeId);
  if (cached) return cached;

  const [{ data: node }, { data: lesson }] = await Promise.all([
    supabaseAdmin.from('knowledge_map_nodes').select('label').eq('id', nodeId).maybeSingle(),
    supabaseAdmin.from('knowledge_map_node_lessons').select('encoding_content').eq('node_id', nodeId).maybeSingle(),
  ]);
  const explanation = (lesson?.encoding_content as { explanation?: string } | null)?.explanation;
  if (!node || !explanation) return null;

  const raw = await callClaudeJSON({
    model: MODELS.simpleQuestion,
    systemPrompt: NODE_NOTES_COMPILE_PROMPT,
    userContent: `Concept: ${node.label}\nExplanation: ${explanation}`,
    temperature: 0.2,
  });
  const notes = raw.trim();

  const { error } = await supabaseAdmin
    .from('knowledge_map_node_notes')
    .upsert({ node_id: nodeId, notes_content: notes }, { onConflict: 'node_id' });
  if (error) throw error;

  return { notes };
}

export async function getEdgeNotes(fromNodeId: string, toNodeId: string): Promise<{ transferSummary: string; integrationSummary: string } | null> {
  const edge = await resolveEdgeForReview(fromNodeId, toNodeId);
  if (!edge) return null;
  const { data } = await supabaseAdmin
    .from('knowledge_map_edge_notes')
    .select('transfer_summary, integration_summary')
    .eq('edge_id', edge.id)
    .maybeSingle();
  return data ? { transferSummary: data.transfer_summary as string, integrationSummary: data.integration_summary as string } : null;
}

// Also unlocks these notes for `userId` (see knowledge_map_edge_notes_unlocked's
// own comment) regardless of whether the note text itself already existed
// from another student passing this same link first - the generation is
// shared, but "does this show up on MY notes page" is per student.
export async function compileEdgeNotes(
  userId: string,
  fromNodeId: string,
  toNodeId: string
): Promise<{ transferSummary: string; integrationSummary: string } | null> {
  const edge = await resolveEdgeForReview(fromNodeId, toNodeId);
  if (!edge || !edge.linkTeaching) return null;

  let notes = await getEdgeNotes(fromNodeId, toNodeId);
  if (!notes) {
    const raw = await callClaudeJSON({
      model: MODELS.simpleQuestion,
      systemPrompt: EDGE_NOTES_COMPILE_PROMPT,
      userContent: `Concept A: ${edge.fromNode.label}\nConcept B: ${edge.toNode.label}\nReference material: ${edge.linkTeaching}`,
      temperature: 0.2,
    });
    notes = parseModelJson<{ transferSummary: string; integrationSummary: string }>(raw);

    const { error } = await supabaseAdmin
      .from('knowledge_map_edge_notes')
      .upsert(
        { edge_id: edge.id, transfer_summary: notes.transferSummary, integration_summary: notes.integrationSummary },
        { onConflict: 'edge_id' }
      );
    if (error) throw error;
  }

  const { error: unlockError } = await supabaseAdmin
    .from('knowledge_map_edge_notes_unlocked')
    .upsert({ user_id: userId, edge_id: edge.id }, { onConflict: 'user_id,edge_id' });
  if (unlockError) throw unlockError;

  return notes;
}

interface NotesIndexNode {
  nodeId: string;
  label: string;
  subtopic: string;
  theme: string | null;
  hasNotes: boolean;
}
interface NotesIndexLink {
  fromNodeId: string;
  toNodeId: string;
  fromLabel: string;
  toLabel: string;
}
export interface NotesIndexSubject {
  subject: string;
  qualification: string;
  examBoard: string;
  nodes: NotesIndexNode[];
  links: NotesIndexLink[];
}

// Auto-populates the Notes page's own sidebar (see learn/index.html's
// openNotesPage) - every node this student has ever encoded (concept_reviews
// having a row for its concept_id is exactly what "encoded" already means
// everywhere else in the knowledge map, e.g. qualifying-links/blockedByUnencodedLink),
// grouped by subject, plus every link they've unlocked notes for (see
// compileEdgeNotes). A node with no notes compiled YET still appears
// (hasNotes: false) so the "Compile notes" button has something to attach
// to; a link only ever appears once its notes exist, since those are only
// ever auto-compiled after a genuine pass, never manually triggered.
export async function getNotesIndexForUser(userId: string): Promise<{ subjects: NotesIndexSubject[] }> {
  const { data: reviewRows, error: reviewError } = await supabaseAdmin
    .from('concept_reviews')
    .select('concept_id')
    .eq('user_id', userId);
  if (reviewError) throw reviewError;
  const encodedConceptIds = Array.from(new Set((reviewRows || []).map((r) => r.concept_id as string)));

  interface NodeRow {
    id: string;
    subject: string;
    qualification: string;
    exam_board: string;
    label: string;
    subtopic: string;
    theme: string | null;
    concept_id: string;
  }
  const nodeRows = encodedConceptIds.length
    ? await selectRowsByIdChunked<NodeRow>(
        'knowledge_map_nodes',
        'id, subject, qualification, exam_board, label, subtopic, theme, concept_id',
        'concept_id',
        encodedConceptIds
      )
    : [];

  const nodeIds = nodeRows.map((n) => n.id);
  const noteRows = nodeIds.length
    ? await selectRowsByIdChunked<{ node_id: string }>('knowledge_map_node_notes', 'node_id', 'node_id', nodeIds)
    : [];
  const nodesWithNotes = new Set(noteRows.map((r) => r.node_id));

  const { data: unlockedRows, error: unlockedError } = await supabaseAdmin
    .from('knowledge_map_edge_notes_unlocked')
    .select('edge_id')
    .eq('user_id', userId);
  if (unlockedError) throw unlockedError;
  const unlockedEdgeIds = Array.from(new Set((unlockedRows || []).map((r) => r.edge_id as string)));

  interface EdgeRow {
    id: string;
    from_node_id: string;
    to_node_id: string;
  }
  const edgeRows = unlockedEdgeIds.length
    ? await selectRowsByIdChunked<EdgeRow>('knowledge_map_edges', 'id, from_node_id, to_node_id', 'id', unlockedEdgeIds)
    : [];

  // Edge endpoints may not be in nodeRows above (nodeRows is scoped to
  // ENCODED concepts only, and both endpoints of an unlocked link always
  // are - but fetched fresh here rather than assumed, since nodeRows'
  // de-duplication-by-concept-id could in principle differ from de-dup-by-node-id).
  const edgeNodeIds = Array.from(new Set(edgeRows.flatMap((e) => [e.from_node_id, e.to_node_id])));
  const edgeNodeRows = edgeNodeIds.length
    ? await selectRowsByIdChunked<NodeRow>(
        'knowledge_map_nodes',
        'id, subject, qualification, exam_board, label, subtopic, theme, concept_id',
        'id',
        edgeNodeIds
      )
    : [];
  const nodeById = new Map(edgeNodeRows.map((n) => [n.id, n]));

  const subjectsByKey = new Map<string, NotesIndexSubject>();
  const subjectKey = (n: NodeRow) => `${n.subject} ${n.qualification} ${n.exam_board}`;
  const getSubjectEntry = (n: NodeRow): NotesIndexSubject => {
    const key = subjectKey(n);
    let entry = subjectsByKey.get(key);
    if (!entry) {
      entry = { subject: n.subject, qualification: n.qualification, examBoard: n.exam_board, nodes: [], links: [] };
      subjectsByKey.set(key, entry);
    }
    return entry;
  };

  nodeRows.forEach((n) => {
    getSubjectEntry(n).nodes.push({
      nodeId: n.id,
      label: n.label,
      subtopic: n.subtopic,
      theme: n.theme,
      hasNotes: nodesWithNotes.has(n.id),
    });
  });

  edgeRows.forEach((e) => {
    const fromNode = nodeById.get(e.from_node_id);
    const toNode = nodeById.get(e.to_node_id);
    if (!fromNode || !toNode) return;
    getSubjectEntry(fromNode).links.push({
      fromNodeId: e.from_node_id,
      toNodeId: e.to_node_id,
      fromLabel: fromNode.label,
      toLabel: toNode.label,
    });
  });

  return { subjects: Array.from(subjectsByKey.values()) };
}
