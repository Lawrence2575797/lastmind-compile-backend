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
import { selectAllRows, selectRowsByIdChunked } from './supabasePagination';
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

interface NotesIndexLink {
  toNodeId: string;
  toLabel: string;
  unlocked: boolean;
}
interface NotesIndexNode {
  nodeId: string;
  label: string;
  subtopic: string;
  theme: string | null;
  encoded: boolean;
  hasNotes: boolean;
  links: NotesIndexLink[];
}
export interface NotesIndexSubject {
  subject: string;
  qualification: string;
  examBoard: string;
  nodes: NotesIndexNode[];
}

interface NotesIndexNodeRow {
  id: string;
  subject: string;
  qualification: string;
  exam_board: string;
  label: string;
  subtopic: string;
  theme: string | null;
  concept_id: string;
}

// Subtopic strings are spec-numbered ("1.1 Nature of economics", "4.5 Role
// of the state in the macroeconomy" - see generate_knowledge_map.js's own
// SUBTOPICS list) but there's no dedicated sort_order column anywhere on
// knowledge_map_nodes, so this parses the leading "N" or "N.M" and compares
// numerically (a plain string sort would put "1.10" before "1.2") - this is
// the actual specification order, not the order Postgres happens to return
// rows in (there's no ORDER BY anywhere in this app's existing knowledge-map
// queries either). Two nodes sharing a subtopic fall back to their label.
function parseSubtopicOrder(subtopic: string): [number, number] {
  const match = /^(\d+)(?:\.(\d+))?/.exec(subtopic || '');
  if (!match) return [Number.MAX_SAFE_INTEGER, 0];
  return [Number(match[1]), match[2] ? Number(match[2]) : 0];
}
function compareBySpecOrder(a: NotesIndexNodeRow, b: NotesIndexNodeRow): number {
  const [aMajor, aMinor] = parseSubtopicOrder(a.subtopic);
  const [bMajor, bMinor] = parseSubtopicOrder(b.subtopic);
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  if (a.subtopic !== b.subtopic) return a.subtopic.localeCompare(b.subtopic);
  return a.label.localeCompare(b.label);
}

// Auto-populates the Notes page's own sidebar (see learn/index.html's
// openNotesPage) - EVERY node on the knowledge map for any subject this
// student has touched at all (not just the ones they've personally
// encoded yet - a student should see the whole spec laid out, in spec
// order, with "not encoded yet" nodes visible but inert, same as the
// knowledge map graph itself never hides a node just because it isn't
// done). "Has this student touched this subject at all" is still decided
// by concept_reviews (any encoded concept in it), same signal the rest of
// the knowledge map already uses for "has this student started this
// subject" - a student who's never opened a subject's map at all doesn't
// get an empty shell for it here either.
//
// Each node carries its own outgoing links (not a separate subject-level
// list) - a link only ever appears once notes exist (`unlocked`) or is
// otherwise show-but-locked (see the frontend's own handling), matching
// the fact these are only ever auto-compiled after a genuine review pass,
// never manually triggered - a link to a target that isn't itself encoded
// yet doesn't appear at all, since nothing could have been tested for it
// (same qualifying-link rule the node review itself already enforces).
export async function getNotesIndexForUser(userId: string): Promise<{ subjects: NotesIndexSubject[] }> {
  const { data: reviewRows, error: reviewError } = await supabaseAdmin
    .from('concept_reviews')
    .select('concept_id')
    .eq('user_id', userId);
  if (reviewError) throw reviewError;
  const encodedConceptIds = new Set((reviewRows || []).map((r) => r.concept_id as string));
  if (!encodedConceptIds.size) return { subjects: [] };

  // Only used to discover which (subject, qualification, exam_board)
  // triples this student has touched at all - the full, spec-complete
  // node list for each of those triples is fetched separately below.
  const touchedNodeRows = await selectRowsByIdChunked<NotesIndexNodeRow>(
    'knowledge_map_nodes',
    'id, subject, qualification, exam_board, label, subtopic, theme, concept_id',
    'concept_id',
    Array.from(encodedConceptIds)
  );
  const subjectTriples = new Map<string, { subject: string; qualification: string; examBoard: string }>();
  touchedNodeRows.forEach((n) => {
    const key = `${n.subject} ${n.qualification} ${n.exam_board}`;
    if (!subjectTriples.has(key)) subjectTriples.set(key, { subject: n.subject, qualification: n.qualification, examBoard: n.exam_board });
  });

  const { data: unlockedRows, error: unlockedError } = await supabaseAdmin
    .from('knowledge_map_edge_notes_unlocked')
    .select('edge_id')
    .eq('user_id', userId);
  if (unlockedError) throw unlockedError;
  const unlockedEdgeIds = new Set((unlockedRows || []).map((r) => r.edge_id as string));

  const subjects: NotesIndexSubject[] = [];
  for (const triple of subjectTriples.values()) {
    // Case-insensitive - subject/qualification/examBoard are free text
    // with no canonicalization, same fix findPrerequisiteGap/
    // getKnowledgeMapForSubject already apply for this exact reason.
    const allNodes = await selectAllRows<NotesIndexNodeRow>(
      'knowledge_map_nodes',
      'id, subject, qualification, exam_board, label, subtopic, theme, concept_id',
      (q) => q.ilike('subject', triple.subject.trim()).ilike('qualification', triple.qualification.trim()).ilike('exam_board', triple.examBoard.trim())
    );
    const nodeById = new Map(allNodes.map((n) => [n.id, n]));

    // Fetched with no id filter then narrowed in JS - a large .in() id
    // list itself risks a "Bad Request" (see supabasePagination.ts),
    // same pattern findPrerequisiteGap uses.
    const allEdges = await selectAllRows<{ id: string; from_node_id: string; to_node_id: string }>(
      'knowledge_map_edges',
      'id, from_node_id, to_node_id'
    );
    const edgesByFromNode = new Map<string, { id: string; from_node_id: string; to_node_id: string }[]>();
    allEdges
      .filter((e) => nodeById.has(e.from_node_id) && nodeById.has(e.to_node_id))
      .forEach((e) => {
        const list = edgesByFromNode.get(e.from_node_id) || [];
        list.push(e);
        edgesByFromNode.set(e.from_node_id, list);
      });

    const nodeIds = allNodes.map((n) => n.id);
    const noteRows = nodeIds.length
      ? await selectRowsByIdChunked<{ node_id: string }>('knowledge_map_node_notes', 'node_id', 'node_id', nodeIds)
      : [];
    const nodesWithNotes = new Set(noteRows.map((r) => r.node_id));

    const sortedNodes = [...allNodes].sort(compareBySpecOrder);

    subjects.push({
      subject: triple.subject,
      qualification: triple.qualification,
      examBoard: triple.examBoard,
      nodes: sortedNodes.map((n) => ({
        nodeId: n.id,
        label: n.label,
        subtopic: n.subtopic,
        theme: n.theme,
        encoded: encodedConceptIds.has(n.concept_id),
        hasNotes: nodesWithNotes.has(n.id),
        links: (edgesByFromNode.get(n.id) || [])
          .filter((e) => {
            const toNode = nodeById.get(e.to_node_id);
            return toNode && encodedConceptIds.has(toNode.concept_id);
          })
          .map((e) => {
            const toNode = nodeById.get(e.to_node_id)!;
            return { toNodeId: toNode.id, toLabel: toNode.label, unlocked: unlockedEdgeIds.has(e.id) };
          }),
      })),
    });
  }

  return { subjects };
}
