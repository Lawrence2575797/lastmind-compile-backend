// The knowledge map's Notes page (see learn/index.html's Notes sidebar
// tree) — compiled study notes generated straight from a node's/edge's own
// already-authored ground truth (encoding_content's explanation,
// link_teaching_content), never from a student's own answer. Node notes are
// earned once a node is encoded; edge (transfer+integration) notes are
// earned once a review session actually passes both the identify and
// integration checks for that link (see renderNodeReviewSummary's own
// comment in learn/index.html). Both are compiled ONCE per node/edge and
// shared across every student who's earned them — same one-time-generation
// contract as the underlying lesson content itself — via Haiku
// (MODELS.simpleQuestion), since turning already-written ground truth into
// a shorter note is a genuinely easy transform, not a task that needs a
// bigger model.
import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { parseModelJson } from './jsonParsing';
import { selectAllRows, selectRowsByIdChunked } from './supabasePagination';
import { resolveEdgeForReview, linkIntegrationConceptId } from './nodeReviewService';
import { getSpecMicrotopics, getSubtopicThemeMap, fallbackThemeName } from './chainService';
import { listUserFolders } from './folderSyncService';
import { resolveSubjectTriple } from './subjectResolution';
import { topologicalNodeOrder } from './nodeOrdering';
import { NODE_NOTES_COMPILE_PROMPT, EDGE_NOTES_COMPILE_PROMPT, SUBTOPIC_NODE_ORDER_PROMPT, WORKED_EXAMPLE_STEP_CHECK_PROMPT } from '../constants/knowledgeMapNotesPrompts';

export type NodeNoteVisual =
  | { type: 'diagram'; spec: unknown }
  | { type: 'comparison'; otherLabel: string; thisPoints: string[]; otherPoints: string[] }
  | { type: 'workedExample'; steps: string[] }
  | { type: 'example'; text: string }
  | { type: 'none' };

export interface NodeNotesResult {
  heading: string;
  paragraphs: string[];
  visual: NodeNoteVisual;
}

// notes_content stays a plain `text` column (no schema change) but now
// carries a JSON-encoded NodeNotesResult instead of a raw string - avoids
// a manual DB migration for what's otherwise an opaque cache blob. A
// pre-existing row from before this change (a bare string, not JSON)
// still degrades gracefully: shown as a single untitled paragraph rather
// than breaking the page.
function parseStoredNodeNotes(raw: string, fallbackLabel: string): NodeNotesResult {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.paragraphs)) {
      return { heading: parsed.heading || fallbackLabel, paragraphs: parsed.paragraphs, visual: parsed.visual || { type: 'none' } };
    }
  } catch {
    // Legacy plain-text row - fall through to the wrap-as-one-paragraph case below.
  }
  return { heading: fallbackLabel, paragraphs: [raw], visual: { type: 'none' } };
}

export async function getNodeNotes(nodeId: string): Promise<NodeNotesResult | null> {
  const { data } = await supabaseAdmin.from('knowledge_map_node_notes').select('notes_content').eq('node_id', nodeId).maybeSingle();
  if (!data) return null;
  const { data: node } = await supabaseAdmin.from('knowledge_map_nodes').select('label').eq('id', nodeId).maybeSingle();
  return parseStoredNodeNotes(data.notes_content as string, node?.label || '');
}

interface SiblingCandidate {
  label: string;
  explanation: string;
}

// Up to 6 other nodes in the same subtopic, each with their own
// explanation - candidates the compile prompt can pick a genuine
// comparison from (see NODE_NOTES_COMPILE_PROMPT's visualType rules).
// Capped since this is a per-compile-call cost, not a one-time index
// build, and a subtopic can have far more than 6 nodes.
async function getSiblingCandidates(nodeId: string, subtopic: string, subject: string, qualification: string, examBoard: string): Promise<SiblingCandidate[]> {
  if (!subtopic) return [];
  const { data: siblingNodes } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('id, label')
    .eq('subtopic', subtopic)
    .ilike('subject', subject.trim())
    .ilike('qualification', qualification.trim())
    .ilike('exam_board', examBoard.trim())
    .neq('id', nodeId)
    .limit(6);
  if (!siblingNodes?.length) return [];

  const siblingIds = siblingNodes.map((n) => n.id as string);
  const { data: lessons } = await supabaseAdmin
    .from('knowledge_map_node_lessons')
    .select('node_id, encoding_content')
    .in('node_id', siblingIds);
  const explanationByNodeId = new Map(
    (lessons || []).map((l) => [l.node_id as string, (l.encoding_content as { explanation?: string } | null)?.explanation])
  );

  return siblingNodes
    .map((n) => ({ label: n.label as string, explanation: explanationByNodeId.get(n.id as string) }))
    .filter((c): c is SiblingCandidate => !!c.explanation);
}

interface NodeNotesModelResponse {
  heading: string;
  paragraphs: string[];
  visualType: 'comparison' | 'workedExample' | 'example' | 'none';
  comparison?: { otherLabel: string; thisPoints: string[]; otherPoints: string[] };
  workedExample?: { steps: string[] };
  example?: string;
}

export async function compileNodeNotes(nodeId: string): Promise<NodeNotesResult | null> {
  const cached = await getNodeNotes(nodeId);
  if (cached) return cached;

  const [{ data: node }, { data: lesson }] = await Promise.all([
    supabaseAdmin.from('knowledge_map_nodes').select('label, subtopic, subject, qualification, exam_board').eq('id', nodeId).maybeSingle(),
    supabaseAdmin.from('knowledge_map_node_lessons').select('encoding_content').eq('node_id', nodeId).maybeSingle(),
  ]);
  const encodingContent = lesson?.encoding_content as { explanation?: string; practiceQuestion?: { diagramSpec?: { notDiagrammatic?: boolean } } } | null;
  const explanation = encodingContent?.explanation;
  if (!node || !explanation) return null;

  // The diagram check already ran once, offline, for every diagrammatic
  // node (see generate_diagram_specs.js / MECHANISTIC_DIAGRAM_SPEC_PROMPT)
  // - reuse that verdict rather than asking the model to re-decide
  // diagram-appropriateness here. Dual coding's payoff is real diagram
  // content, so a genuine diagramSpec always wins over the model's own
  // comparison/example choice below.
  const diagramSpec = encodingContent?.practiceQuestion?.diagramSpec;
  const hasDiagram = !!diagramSpec && !diagramSpec.notDiagrammatic;

  const siblings = hasDiagram
    ? []
    : await getSiblingCandidates(nodeId, node.subtopic as string, node.subject as string, node.qualification as string, node.exam_board as string);

  const userContent = [
    `Concept: ${node.label}`,
    `Explanation: ${explanation}`,
    siblings.length
      ? `Sibling concepts from the same lesson (possible comparison candidates):\n${siblings.map((s) => `- ${s.label}: ${s.explanation}`).join('\n')}`
      : null,
  ].filter(Boolean).join('\n\n');

  const raw = await callClaudeJSON({
    model: MODELS.simpleQuestion,
    systemPrompt: NODE_NOTES_COMPILE_PROMPT,
    userContent,
    temperature: 0.2,
  });
  const modelResult = parseModelJson<NodeNotesModelResponse>(raw);

  let visual: NodeNoteVisual = { type: 'none' };
  if (hasDiagram) {
    visual = { type: 'diagram', spec: diagramSpec };
  } else if (modelResult.visualType === 'comparison' && modelResult.comparison) {
    const matchedSibling = siblings.find((s) => s.label === modelResult.comparison!.otherLabel);
    if (matchedSibling) visual = { type: 'comparison', ...modelResult.comparison };
  } else if (modelResult.visualType === 'workedExample' && modelResult.workedExample?.steps?.length) {
    visual = { type: 'workedExample', steps: modelResult.workedExample.steps };
  } else if (modelResult.visualType === 'example' && modelResult.example) {
    visual = { type: 'example', text: modelResult.example };
  }

  const result: NodeNotesResult = { heading: modelResult.heading || node.label, paragraphs: modelResult.paragraphs || [], visual };

  const { error } = await supabaseAdmin
    .from('knowledge_map_node_notes')
    .upsert({ node_id: nodeId, notes_content: JSON.stringify(result) }, { onConflict: 'node_id' });
  if (error) throw error;

  return result;
}

export interface EdgeNotesResult {
  transferSummary: string;
  heading: string;
  paragraphs: string[];
  visual: NodeNoteVisual;
}

// integration_summary stays a plain `text` column but now carries a
// JSON-encoded {heading, paragraphs, visual} instead of one text blob -
// same no-migration reasoning as parseStoredNodeNotes above. A
// pre-existing plain-string OR pre-visual {heading, paragraphs} row
// degrades to a fallback heading/no-visual, rather than breaking.
function parseStoredIntegrationSummary(raw: string, fallbackHeading: string): { heading: string; paragraphs: string[]; visual: NodeNoteVisual } {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.paragraphs)) {
      return { heading: parsed.heading || fallbackHeading, paragraphs: parsed.paragraphs, visual: parsed.visual || { type: 'none' } };
    }
  } catch {
    // Legacy plain-text row - fall through.
  }
  return { heading: fallbackHeading, paragraphs: [raw], visual: { type: 'none' } };
}

export async function getEdgeNotes(fromNodeId: string, toNodeId: string): Promise<EdgeNotesResult | null> {
  const edge = await resolveEdgeForReview(fromNodeId, toNodeId);
  if (!edge) return null;
  const { data } = await supabaseAdmin
    .from('knowledge_map_edge_notes')
    .select('transfer_summary, integration_summary')
    .eq('edge_id', edge.id)
    .maybeSingle();
  if (!data) return null;
  const { heading, paragraphs, visual } = parseStoredIntegrationSummary(data.integration_summary as string, `${edge.fromNode.label} → ${edge.toNode.label}`);
  return { transferSummary: data.transfer_summary as string, heading, paragraphs, visual };
}

// Fetch-or-generate ONLY - no per-user unlock side effect. Split out of
// compileEdgeNotes (below) so the integration REVIEW step (see
// routes/knowledgeMap.ts's node-review/integration/start) can show this
// same compiled visual on a student's first attempt - exactly when
// linkTeaching itself is already shown raw, before they've answered
// anything - without prematurely marking these notes "earned" on the
// separate Notes page, which stays gated on an actual pass (see this
// file's own top comment). The generated content is shared/global either
// way; only the unlock flag is per-student.
export async function compileEdgeNotesContent(fromNodeId: string, toNodeId: string): Promise<EdgeNotesResult | null> {
  const edge = await resolveEdgeForReview(fromNodeId, toNodeId);
  if (!edge || !edge.linkTeaching) return null;

  const cached = await getEdgeNotes(fromNodeId, toNodeId);
  if (cached) return cached;

  const raw = await callClaudeJSON({
    model: MODELS.simpleQuestion,
    systemPrompt: EDGE_NOTES_COMPILE_PROMPT,
    userContent: `Concept A: ${edge.fromNode.label}\nConcept B: ${edge.toNode.label}\nReference material: ${edge.linkTeaching}`,
    temperature: 0.2,
  });
  const modelResult = parseModelJson<{
    transferSummary: string;
    heading: string;
    paragraphs: string[];
    visualType: 'workedExample' | 'example' | 'none';
    workedExample?: { steps: string[] };
    example?: string;
  }>(raw);
  const visual: NodeNoteVisual =
    modelResult.visualType === 'workedExample' && modelResult.workedExample
      ? { type: 'workedExample', steps: modelResult.workedExample.steps }
      : modelResult.visualType === 'example' && modelResult.example
      ? { type: 'example', text: modelResult.example }
      : { type: 'none' };
  const notes: EdgeNotesResult = { transferSummary: modelResult.transferSummary, heading: modelResult.heading, paragraphs: modelResult.paragraphs, visual };

  const { error } = await supabaseAdmin
    .from('knowledge_map_edge_notes')
    .upsert(
      { edge_id: edge.id, transfer_summary: notes.transferSummary, integration_summary: JSON.stringify({ heading: notes.heading, paragraphs: notes.paragraphs, visual: notes.visual }) },
      { onConflict: 'edge_id' }
    );
  if (error) throw error;

  return notes;
}

// Also unlocks these notes for `userId` (see knowledge_map_edge_notes_unlocked's
// own comment) regardless of whether the note text itself already existed
// from another student passing this same link first - the generation is
// shared, but "does this show up on MY notes page" is per student.
export async function compileEdgeNotes(
  userId: string,
  fromNodeId: string,
  toNodeId: string
): Promise<EdgeNotesResult | null> {
  const notes = await compileEdgeNotesContent(fromNodeId, toNodeId);
  if (!notes) return null;

  const edge = await resolveEdgeForReview(fromNodeId, toNodeId);
  if (!edge) return null;
  const { error: unlockError } = await supabaseAdmin
    .from('knowledge_map_edge_notes_unlocked')
    .upsert({ user_id: userId, edge_id: edge.id }, { onConflict: 'user_id,edge_id' });
  if (unlockError) throw unlockError;

  return notes;
}

// Checks one line of a student's own attempt at an interactive worked-
// example walkthrough (see renderNodeNoteBlock's workedExample branch in
// learn/index.html) against the corresponding ground-truth line - a
// targeted check against an already-known answer, not open tutoring,
// hence Haiku. Shared by both the node and edge worked-example visuals
// (identical shape, {steps: string[]}), so callers just pass whichever
// steps array they already fetched via getNodeNotes/getEdgeNotes.
export async function checkWorkedExampleStep(
  steps: string[],
  stepIndex: number,
  answer: string
): Promise<{ correct: boolean; feedback: string }> {
  const userContent = `Full worked example:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nStudent is attempting line ${stepIndex + 1}.\nStudent's own typed line: ${answer}`;
  const raw = await callClaudeJSON({
    model: MODELS.simpleQuestion,
    systemPrompt: WORKED_EXAMPLE_STEP_CHECK_PROMPT,
    userContent,
    temperature: 0.1,
  });
  return parseModelJson<{ correct: boolean; feedback: string }>(raw);
}

interface NotesIndexLink {
  toNodeId: string;
  toLabel: string;
  unlocked: boolean;
}
interface NotesIndexNode {
  nodeId: string;
  label: string;
  encoded: boolean;
  hasNotes: boolean;
  links: NotesIndexLink[];
}
interface NotesIndexSubtopic {
  subtopic: string;
  nodes: NotesIndexNode[];
}
interface NotesIndexTheme {
  theme: string;
  subtopics: NotesIndexSubtopic[];
}
export interface NotesIndexSubject {
  subject: string;
  qualification: string;
  examBoard: string;
  themes: NotesIndexTheme[];
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
// SUBTOPICS list) - parses the leading "N" or "N.M" and compares
// numerically (a plain string sort would put "1.10" before "1.2"). This is
// the actual specification order for GROUPING subtopics into lessons and
// lessons into themes; ordering the individual concept nodes WITHIN one
// subtopic is a separate problem this alone can't solve (they all share
// the same subtopic string) - see getOrComputeSubtopicOrder for that.
function parseSubtopicOrder(subtopic: string): [number, number] {
  const match = /^(\d+)(?:\.(\d+))?/.exec(subtopic || '');
  if (!match) return [Number.MAX_SAFE_INTEGER, 0];
  return [Number(match[1]), match[2] ? Number(match[2]) : 0];
}
export function compareSubtopics(a: string, b: string): number {
  const [aMajor, aMinor] = parseSubtopicOrder(a);
  const [bMajor, bMinor] = parseSubtopicOrder(b);
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return a.localeCompare(b);
}

async function getCachedSubtopicOrder(subject: string, qualification: string, examBoard: string, subtopic: string): Promise<string[] | null> {
  const { data } = await supabaseAdmin
    .from('knowledge_map_node_spec_order')
    .select('node_order')
    .eq('subject', subject)
    .eq('qualification', qualification)
    .eq('exam_board', examBoard)
    .eq('subtopic', subtopic)
    .maybeSingle();
  return (data?.node_order as string[] | undefined) ?? null;
}

// Node creation order isn't recoverable from the DB (knowledge_map_nodes
// has no rank column, and its rows are bulk-inserted with a shared
// created_at per chunk of up to 200 - see ingest_knowledge_map.js), so
// there's no honest way to reconstruct "the order they were generated in"
// after the fact. Instead this reconstructs genuine TEACHING order from
// scratch, once per subtopic, via a cheap model call grounded in
// exam_spec_outlines' own microtopics breakdown where one has been seeded
// for this subject (see SUBTOPIC_NODE_ORDER_PROMPT) - a pure enhancement,
// same as every other spec-outline lookup in this app: a subject with no
// seeded microtopics still gets a genuine best-effort teaching order from
// the model's own subject knowledge, just without that extra grounding.
async function computeSubtopicOrder(
  subject: string,
  qualification: string,
  examBoard: string,
  subtopic: string,
  nodes: { id: string; label: string }[]
): Promise<string[]> {
  if (nodes.length <= 1) return nodes.map((n) => n.id);

  const microtopics = await getSpecMicrotopics(subject, qualification, examBoard);
  const matchedSubtopic = microtopics?.themes
    .flatMap((t) => t.subtopics)
    .find((s) => s.subtopic.trim().toLowerCase() === subtopic.trim().toLowerCase());
  const microtopicsList = matchedSubtopic?.microtopics || [];

  const userContent = [
    `Subtopic: ${subtopic}`,
    microtopicsList.length
      ? `Content points, in the order the specification teaches them:\n${microtopicsList.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
      : null,
    `Concepts to order (by index):\n${nodes.map((n, i) => `${i}: ${n.label}`).join('\n')}`,
  ].filter(Boolean).join('\n\n');

  let order: number[] = nodes.map((_, i) => i);
  try {
    const raw = await callClaudeJSON({
      model: MODELS.simpleQuestion,
      systemPrompt: SUBTOPIC_NODE_ORDER_PROMPT,
      userContent,
      temperature: 0.1,
    });
    const parsed = parseModelJson<{ order: number[] }>(raw).order;
    const isValidPermutation =
      Array.isArray(parsed) &&
      parsed.length === nodes.length &&
      new Set(parsed).size === nodes.length &&
      parsed.every((i) => Number.isInteger(i) && i >= 0 && i < nodes.length);
    if (isValidPermutation) order = parsed;
  } catch (err) {
    console.error(`LastMind: subtopic node ordering failed for "${subtopic}", falling back to original order.`, err);
  }

  return order.map((i) => nodes[i].id);
}

// Cache-or-compute, plus a cheap merge for the case a subtopic gained a
// new node since its order was last cached (no re-computation needed - the
// new node is simply appended, same "never worse than before" fallback
// spirit as everywhere else in this file).
export async function getOrComputeSubtopicOrder(
  subject: string,
  qualification: string,
  examBoard: string,
  subtopic: string,
  nodes: { id: string; label: string }[]
): Promise<string[]> {
  const cached = await getCachedSubtopicOrder(subject, qualification, examBoard, subtopic);
  if (cached) {
    const nodeIds = new Set(nodes.map((n) => n.id));
    const stillValid = cached.filter((id) => nodeIds.has(id));
    const missing = nodes.filter((n) => !cached.includes(n.id)).map((n) => n.id);
    if (!missing.length && stillValid.length === cached.length) return stillValid;
    const merged = [...stillValid, ...missing];
    const { error } = await supabaseAdmin
      .from('knowledge_map_node_spec_order')
      .upsert(
        { subject, qualification, exam_board: examBoard, subtopic, node_order: merged },
        { onConflict: 'subject,qualification,exam_board,subtopic' }
      );
    if (error) throw error;
    return merged;
  }

  const order = await computeSubtopicOrder(subject, qualification, examBoard, subtopic, nodes);
  const { error } = await supabaseAdmin
    .from('knowledge_map_node_spec_order')
    .upsert(
      { subject, qualification, exam_board: examBoard, subtopic, node_order: order },
      { onConflict: 'subject,qualification,exam_board,subtopic' }
    );
  if (error) throw error;
  return order;
}

// Auto-populates the Notes sidebar tree (see learn/index.html's Notes tab)
// - EVERY node on the knowledge map for any subject this student has
// touched at all (not just the ones they've personally encoded yet - a
// student should see the whole spec laid out, with "not encoded yet" nodes
// visible but inert, same as the knowledge map graph itself never hides a
// node just because it isn't done). "Has this student touched this subject
// at all" is still decided by concept_reviews (any encoded concept in it),
// same signal the rest of the knowledge map already uses.
//
// Nested Subject -> Theme -> Subtopic ("lesson") -> Node, matching the
// sidebar tree's own dropdown structure directly so the frontend never has
// to re-derive groupings. Each node carries its own outgoing links (not a
// separate subject-level list) - a link to a target that isn't itself
// encoded yet doesn't appear at all, since nothing could have been tested
// for it (same qualifying-link rule the node review itself already
// enforces); an unlocked one is playable, a not-yet-unlocked one still
// shows locked (see the frontend's own handling).
export async function getNotesIndexForUser(userId: string): Promise<{ subjects: NotesIndexSubject[] }> {
  const { data: reviewRows, error: reviewError } = await supabaseAdmin
    .from('concept_reviews')
    .select('concept_id')
    .eq('user_id', userId);
  if (reviewError) throw reviewError;
  const encodedConceptIds = new Set((reviewRows || []).map((r) => r.concept_id as string));

  // Only used to discover which (subject, qualification, exam_board)
  // triples this student has touched at all - the full, spec-complete
  // node list for each of those triples is fetched separately below.
  const touchedNodeRows = encodedConceptIds.size
    ? await selectRowsByIdChunked<NotesIndexNodeRow>(
        'knowledge_map_nodes',
        'id, subject, qualification, exam_board, label, subtopic, theme, concept_id',
        'concept_id',
        Array.from(encodedConceptIds)
      )
    : [];
  const subjectTriples = new Map<string, { subject: string; qualification: string; examBoard: string }>();
  touchedNodeRows.forEach((n) => {
    const key = `${n.subject} ${n.qualification} ${n.exam_board}`;
    if (!subjectTriples.has(key)) subjectTriples.set(key, { subject: n.subject, qualification: n.qualification, examBoard: n.exam_board });
  });

  // Also seed a triple for every subject folder the student has added at
  // all, even with zero encodings yet - a brand-new subject should still
  // show its full Theme/Subtopic/Lesson tree in the Notes sidebar (same
  // tree the knowledge-map sidebar already shows via buildSubjectTreeHtml),
  // just with every node rendered "not encoded" (buildNode's own encoded
  // flag already defaults to false for anything not in encodedConceptIds -
  // no other change needed for that to fall out correctly).
  const folders = await listUserFolders(userId);
  for (const f of folders) {
    if (f.deletedAt) continue;
    const data = f.data as { subject?: string; qualification?: string; examBoard?: string } | null;
    if (!data?.subject || !data.qualification || !data.examBoard) continue;
    // Resolves a misspelled/abbreviated folder ("Maths", "Edexcell") to
    // the real ingested triple it's closest to (see resolveSubjectTriple's
    // own comment) - otherwise a folder typed slightly differently from
    // the exact ingested spelling would never show a tree at all.
    const resolved = await resolveSubjectTriple(data.subject, data.qualification, data.examBoard);
    const key = `${resolved.subject} ${resolved.qualification} ${resolved.examBoard}`;
    if (!subjectTriples.has(key)) subjectTriples.set(key, resolved);
  }
  if (!subjectTriples.size) return { subjects: [] };

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

    // `knowledge_map_edge_notes_unlocked` only ever gets written live, at
    // the exact moment renderNodeReviewSummary sees a fresh pass within
    // ONE browser session (see learn/index.html's own comment on that
    // hook) - it was never backfilled for a link a student had already
    // covered BEFORE that hook existed, or from a session that ended
    // before reaching the summary screen. Rather than leave those
    // permanently "locked" despite being genuinely covered, also treat a
    // link as unlocked once its integration concept_reviews row exists at
    // all - integration never fails any more (see node-review/integration/
    // submit's own comment: wrong answers retry, only a genuine correct
    // pass ever gets recorded), so the row's mere existence already means
    // this exact link was genuinely passed, not just attempted.
    const candidateEdges = allEdges.filter((e) => {
      const from = nodeById.get(e.from_node_id);
      const to = nodeById.get(e.to_node_id);
      return from && to && encodedConceptIds.has(to.concept_id);
    });
    const edgeConceptIdPairs = candidateEdges.map((e) => {
      const from = nodeById.get(e.from_node_id)!;
      const to = nodeById.get(e.to_node_id)!;
      return { edgeId: e.id, integrationId: linkIntegrationConceptId(from.concept_id, to.concept_id) };
    });
    const allLinkConceptIds = Array.from(new Set(edgeConceptIdPairs.map((p) => p.integrationId)));
    const coveredRows = allLinkConceptIds.length
      ? await selectRowsByIdChunked<{ concept_id: string }>(
          'concept_reviews',
          'concept_id',
          'concept_id',
          allLinkConceptIds,
          (q) => q.eq('user_id', userId)
        )
      : [];
    const everCoveredConceptIds = new Set(coveredRows.map((r) => r.concept_id));
    const durablyUnlockedEdgeIds = new Set(
      edgeConceptIdPairs.filter((p) => everCoveredConceptIds.has(p.integrationId)).map((p) => p.edgeId)
    );

    const themeMap = await getSubtopicThemeMap(triple.subject, triple.qualification, triple.examBoard);

    const bySubtopic = new Map<string, NotesIndexNodeRow[]>();
    allNodes.forEach((n) => {
      const list = bySubtopic.get(n.subtopic) || [];
      list.push(n);
      bySubtopic.set(n.subtopic, list);
    });

    // One (cheap, cache-hit-after-first-time) ordering call per subtopic,
    // run in parallel across the whole subject rather than serially.
    const subtopicOrders = new Map<string, string[]>(
      await Promise.all(
        Array.from(bySubtopic.entries()).map(async ([subtopic, nodes]) => {
          const order = await getOrComputeSubtopicOrder(
            triple.subject,
            triple.qualification,
            triple.examBoard,
            subtopic,
            nodes.map((n) => ({ id: n.id, label: n.label }))
          );
          return [subtopic, order] as [string, string[]];
        })
      )
    );

    const buildNode = (n: NotesIndexNodeRow): NotesIndexNode => ({
      nodeId: n.id,
      label: n.label,
      encoded: encodedConceptIds.has(n.concept_id),
      hasNotes: nodesWithNotes.has(n.id),
      links: (edgesByFromNode.get(n.id) || [])
        .filter((e) => {
          const toNode = nodeById.get(e.to_node_id);
          return toNode && encodedConceptIds.has(toNode.concept_id);
        })
        .map((e) => {
          const toNode = nodeById.get(e.to_node_id)!;
          return { toNodeId: toNode.id, toLabel: toNode.label, unlocked: unlockedEdgeIds.has(e.id) || durablyUnlockedEdgeIds.has(e.id) };
        }),
    });

    const orderedSubtopicKeys = Array.from(bySubtopic.keys()).sort(compareSubtopics);
    const baselineOrderedNodes: NotesIndexNodeRow[] = orderedSubtopicKeys.flatMap((subtopic) => {
      const nodes = bySubtopic.get(subtopic)!;
      const order = subtopicOrders.get(subtopic) || nodes.map((n) => n.id);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      return order.map((id) => byId.get(id)).filter((n): n is NotesIndexNodeRow => !!n);
    });

    // The subtopic/teaching order above is just a model's guess from
    // labels alone, with no view of this subject's actual prerequisite
    // graph - it can disagree with the real edges (found live: "Proof by
    // exhaustion" listed above its own prerequisite "Structure of a
    // mathematical proof"). topologicalNodeOrder corrects that, using
    // baselineOrderedNodes purely as a tie-break preference and only
    // deviating where a real prerequisite edge requires it - same
    // correction getKnowledgeMapForSubject applies, kept consistent here
    // so the Notes tree and the knowledge-map sidebar always agree.
    const subjectEdges = allEdges.filter((e) => nodeById.has(e.from_node_id) && nodeById.has(e.to_node_id));
    const tieBreakRank = new Map(baselineOrderedNodes.map((n, i) => [n.id, i]));
    const dependencyOrderedIds = topologicalNodeOrder(
      baselineOrderedNodes.map((n) => n.id),
      subjectEdges.map((e) => ({ from: e.from_node_id, to: e.to_node_id })),
      tieBreakRank
    );
    const finalNodeById = new Map(baselineOrderedNodes.map((n) => [n.id, n]));
    const bySubtopicOrdered = new Map<string, NotesIndexNodeRow[]>();
    dependencyOrderedIds.forEach((id) => {
      const n = finalNodeById.get(id);
      if (!n) return;
      const list = bySubtopicOrdered.get(n.subtopic) || [];
      list.push(n);
      bySubtopicOrdered.set(n.subtopic, list);
    });

    const subtopicsBuilt: NotesIndexSubtopic[] = orderedSubtopicKeys.map((subtopic) => ({
      subtopic,
      nodes: (bySubtopicOrdered.get(subtopic) || []).map(buildNode),
    }));

    const themesMap = new Map<string, NotesIndexSubtopic[]>();
    subtopicsBuilt.forEach((s) => {
      const themeName = themeMap.get(s.subtopic) || fallbackThemeName(s.subtopic);
      const list = themesMap.get(themeName) || [];
      list.push(s);
      themesMap.set(themeName, list);
    });
    // Theme order follows the minimum spec number among its own
    // subtopics (subtopicsBuilt is already spec-sorted, so this is just
    // each theme's first-seen position) - robust regardless of whether
    // the theme's own display name happens to start with "Theme N".
    const themeOrder: string[] = [];
    subtopicsBuilt.forEach((s) => {
      const themeName = themeMap.get(s.subtopic) || fallbackThemeName(s.subtopic);
      if (!themeOrder.includes(themeName)) themeOrder.push(themeName);
    });

    subjects.push({
      subject: triple.subject,
      qualification: triple.qualification,
      examBoard: triple.examBoard,
      themes: themeOrder.map((theme) => ({ theme, subtopics: themesMap.get(theme)! })),
    });
  }

  return { subjects };
}

// A student's own hand-written note for one node - see
// knowledge_map_node_personal_notes' own comment. Entirely separate from
// the shared compiled notes above: never touches the Claude API, never
// shared between students, and `content` is opaque to this service (the
// frontend owns its shape - free text today, or a template with a
// heading/body/diagram plus opt-in contrast/example add-ons, and an
// always-available quick-notes scratchpad - so a future template change
// never needs a migration here).
export interface PersonalNoteContent {
  mode: 'freeText' | 'template';
  heading?: string;
  body: string;
  diagram?: unknown;
  sections?: { diagram?: boolean; contrast?: boolean; example?: boolean };
  contrastText?: string;
  exampleText?: string;
  quickNotes?: string;
}

export async function getPersonalNote(userId: string, nodeId: string): Promise<PersonalNoteContent | null> {
  const { data } = await supabaseAdmin
    .from('knowledge_map_node_personal_notes')
    .select('content')
    .eq('user_id', userId)
    .eq('node_id', nodeId)
    .maybeSingle();
  return (data?.content as PersonalNoteContent | undefined) ?? null;
}

export async function savePersonalNote(userId: string, nodeId: string, content: PersonalNoteContent): Promise<void> {
  const { error } = await supabaseAdmin
    .from('knowledge_map_node_personal_notes')
    .upsert({ user_id: userId, node_id: nodeId, content, updated_at: new Date().toISOString() }, { onConflict: 'user_id,node_id' });
  if (error) throw error;
}
