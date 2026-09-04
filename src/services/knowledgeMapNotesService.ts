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
import { resolveEdgeForReview, linkIdentifyConceptId, linkIntegrationConceptId } from './nodeReviewService';
import { getSpecMicrotopics, normalizeForPlanMatch, stripGcseTierForPlanMatch } from './chainService';
import { NODE_NOTES_COMPILE_PROMPT, EDGE_NOTES_COMPILE_PROMPT, SUBTOPIC_NODE_ORDER_PROMPT } from '../constants/knowledgeMapNotesPrompts';

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
function compareSubtopics(a: string, b: string): number {
  const [aMajor, aMinor] = parseSubtopicOrder(a);
  const [bMajor, bMinor] = parseSubtopicOrder(b);
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return a.localeCompare(b);
}

// Real theme names ("Theme 1 - Introduction to markets and market
// failure") for the Notes sidebar tree's top grouping level - sourced from
// spec_lesson_plans (the same canonical, hand-authored lesson breakdown
// chainService.ts's getStoredLessonPlan already uses for chain-generation
// grounding), keyed by subtopic since that's the join key the two tables
// actually share. Same normalized matching as getStoredLessonPlan, since
// qualification is free text that can differ in spacing/hyphenation
// between where a subject's nodes were ingested ("A-Level") and where its
// lesson plan was seeded ("A Level"). Falls back to null per subtopic when
// no lesson plan has been seeded for this subject - the caller derives a
// bare "Theme N" from the subtopic's own leading digit in that case, same
// as this app has always grouped themes, so a subject without a seeded
// plan is never worse off than before this feature, just less nicely named.
async function getSubtopicThemeMap(subject: string, qualification: string, examBoard: string): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin
    .from('spec_lesson_plans')
    .select('qualification, exam_board, subtopic, theme')
    .ilike('subject', subject.trim());
  if (error) {
    console.error('LastMind: spec_lesson_plans theme lookup failed, falling back to bare theme numbers.', error);
    return new Map();
  }
  const wantQualification = normalizeForPlanMatch(stripGcseTierForPlanMatch(qualification));
  const wantExamBoard = normalizeForPlanMatch(examBoard || '');
  const map = new Map<string, string>();
  (data || []).forEach((row) => {
    if (
      normalizeForPlanMatch(row.qualification as string) === wantQualification &&
      normalizeForPlanMatch((row.exam_board as string) || '') === wantExamBoard &&
      !map.has(row.subtopic as string)
    ) {
      map.set(row.subtopic as string, row.theme as string);
    }
  });
  return map;
}

function fallbackThemeName(subtopic: string): string {
  const digit = (subtopic || '').split(' ')[0]?.split('.')[0];
  return digit ? `Theme ${digit}` : 'General';
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
async function getOrComputeSubtopicOrder(
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

    // `knowledge_map_edge_notes_unlocked` only ever gets written live, at
    // the exact moment renderNodeReviewSummary sees a fresh pass within
    // ONE browser session (see learn/index.html's own comment on that
    // hook) - it was never backfilled for links a student had already
    // passed identify+integration for BEFORE that hook existed, or from a
    // session that ended before reaching the summary screen. Rather than
    // leave those permanently "locked" despite being genuinely earned,
    // also treat a link as unlocked when its identify AND integration
    // concept_reviews rows show at least one non-lapse ('again') rating
    // ever recorded (reps > lapses) - the only durable, retroactively-
    // computable signal available (concept_reviews stores current FSRS
    // state, not a full attempt history, so this is "ever graded
    // correct at least once", not "most recent attempt was correct").
    const candidateEdges = allEdges.filter((e) => {
      const from = nodeById.get(e.from_node_id);
      const to = nodeById.get(e.to_node_id);
      return from && to && encodedConceptIds.has(to.concept_id);
    });
    const edgeConceptIdPairs = candidateEdges.map((e) => {
      const from = nodeById.get(e.from_node_id)!;
      const to = nodeById.get(e.to_node_id)!;
      return {
        edgeId: e.id,
        identifyId: linkIdentifyConceptId(from.concept_id, to.concept_id),
        integrationId: linkIntegrationConceptId(from.concept_id, to.concept_id),
      };
    });
    const allLinkConceptIds = Array.from(new Set(edgeConceptIdPairs.flatMap((p) => [p.identifyId, p.integrationId])));
    const passedRows = allLinkConceptIds.length
      ? await selectRowsByIdChunked<{ concept_id: string; reps: number; lapses: number }>(
          'concept_reviews',
          'concept_id, reps, lapses',
          'concept_id',
          allLinkConceptIds,
          (q) => q.eq('user_id', userId)
        )
      : [];
    const everPassedConceptIds = new Set(passedRows.filter((r) => r.reps > r.lapses).map((r) => r.concept_id));
    const durablyUnlockedEdgeIds = new Set(
      edgeConceptIdPairs
        .filter((p) => everPassedConceptIds.has(p.identifyId) && everPassedConceptIds.has(p.integrationId))
        .map((p) => p.edgeId)
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

    const subtopicsBuilt: NotesIndexSubtopic[] = Array.from(bySubtopic.entries()).map(([subtopic, nodes]) => {
      const order = subtopicOrders.get(subtopic) || [];
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const ordered = order.map((id) => byId.get(id)).filter((n): n is NotesIndexNodeRow => !!n);
      return { subtopic, nodes: ordered.map(buildNode) };
    });
    subtopicsBuilt.sort((a, b) => compareSubtopics(a.subtopic, b.subtopic));

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
