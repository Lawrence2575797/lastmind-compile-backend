// The Day-1 check: fires the calendar day after a concept is first
// encoded OR a link has its first integration session (both are just
// "a concept_id's first-ever grade" - see scheduleDay1Check's own call
// site in reviewService.ts, the same hook scheduleImmediateRecall
// already uses for exactly this reason). Prioritised alongside real
// spaced-review sessions (ahead of new lessons) in the feed's own
// recommendation logic - see sfIsNodeReviewDue's frontend counterpart
// for how a due review already outranks a new lesson; this table is
// checked the same way. Never expires - "it doesn't matter the time of
// day, just as long as it's completed... pushed back each day when a
// student doesn't log on until they complete it" - which needs no
// special "push back" logic at all: a due_date that's already passed
// just stays due, the same as any FSRS review that's overdue.
import { supabaseAdmin } from './supabaseAdmin';
import { compareSubtopics, getOrComputeSubtopicOrder } from './knowledgeMapNotesService';

export async function scheduleDay1Check(userId: string, conceptId: string): Promise<void> {
  const dueDate = new Date();
  dueDate.setUTCDate(dueDate.getUTCDate() + 1);
  const dueDateStr = dueDate.toISOString().slice(0, 10); // YYYY-MM-DD, calendar day only
  const { error } = await supabaseAdmin
    .from('day1_checks')
    .upsert({ user_id: userId, concept_id: conceptId, due_date: dueDateStr }, { onConflict: 'user_id,concept_id', ignoreDuplicates: true });
  if (error) console.error('Day-1 check scheduling failed (non-fatal):', error);
}

export interface Day1Question {
  questionText: string;
  markScheme: string;
}

export interface ConceptDisplayInfo {
  label: string;
  subject: string;
}

// Same node-vs-edge detection as getQuestionForConceptId, but for the
// display label/subject GET /day1-checks/due needs to show in the feed
// rather than the question content itself.
export async function getConceptDisplayInfo(conceptId: string): Promise<ConceptDisplayInfo | null> {
  if (conceptId.endsWith('::integration')) {
    const withoutSuffix = conceptId.slice(0, -':integration'.length - 1);
    const arrowIndex = withoutSuffix.indexOf('->');
    if (arrowIndex === -1) return null;
    const fromConceptId = withoutSuffix.slice(0, arrowIndex);
    const toConceptId = withoutSuffix.slice(arrowIndex + 2);
    const [{ data: fromNode }, { data: toNode }] = await Promise.all([
      supabaseAdmin.from('knowledge_map_nodes').select('label, subject').eq('concept_id', fromConceptId).maybeSingle(),
      supabaseAdmin.from('knowledge_map_nodes').select('label, subject').eq('concept_id', toConceptId).maybeSingle(),
    ]);
    if (!fromNode || !toNode) return null;
    return { label: `${fromNode.label} → ${toNode.label}`, subject: fromNode.subject as string };
  }
  const { data: node } = await supabaseAdmin.from('knowledge_map_nodes').select('label, subject').eq('concept_id', conceptId).maybeSingle();
  if (!node) return null;
  return { label: node.label as string, subject: node.subject as string };
}

// A concept_id is either a plain node concept (practiceQuestion) or an
// edge integration concept (fromConceptId->toConceptId::integration,
// per linkIntegrationConceptId in nodeReviewService.ts) - detected by
// the "::integration" suffix rather than needing the caller to know
// which kind this is, since gradeAndRecordReview's own hook fires
// identically for both.
export async function getQuestionForConceptId(conceptId: string): Promise<Day1Question | null> {
  if (conceptId.endsWith('::integration')) {
    const withoutSuffix = conceptId.slice(0, -':integration'.length - 1);
    const arrowIndex = withoutSuffix.indexOf('->');
    if (arrowIndex === -1) return null;
    const fromConceptId = withoutSuffix.slice(0, arrowIndex);
    const toConceptId = withoutSuffix.slice(arrowIndex + 2);
    const [{ data: fromNode }, { data: toNode }] = await Promise.all([
      supabaseAdmin.from('knowledge_map_nodes').select('id').eq('concept_id', fromConceptId).maybeSingle(),
      supabaseAdmin.from('knowledge_map_nodes').select('id').eq('concept_id', toConceptId).maybeSingle(),
    ]);
    if (!fromNode || !toNode) return null;
    const { data: edge } = await supabaseAdmin
      .from('knowledge_map_edges')
      .select('id, knowledge_map_edge_lessons(integration_question)')
      .eq('from_node_id', fromNode.id)
      .eq('to_node_id', toNode.id)
      .maybeSingle();
    const lessonRows = edge?.knowledge_map_edge_lessons;
    const lesson = Array.isArray(lessonRows) ? lessonRows[0] : lessonRows;
    const q = lesson?.integration_question as { questionText?: string; markScheme?: string } | undefined;
    if (!q?.questionText) return null;
    return { questionText: q.questionText, markScheme: q.markScheme || '' };
  }

  const { data: node } = await supabaseAdmin.from('knowledge_map_nodes').select('id').eq('concept_id', conceptId).maybeSingle();
  if (!node) return null;
  const { data: lesson } = await supabaseAdmin.from('knowledge_map_node_lessons').select('encoding_content').eq('node_id', node.id).maybeSingle();
  const q = (lesson?.encoding_content as { practiceQuestion?: { questionText?: string; markScheme?: string } } | null)?.practiceQuestion;
  if (!q?.questionText) return null;
  return { questionText: q.questionText, markScheme: q.markScheme || '' };
}

interface SortNode {
  id: string;
  label: string;
  subtopic: string;
  subject: string;
  qualification: string;
  examBoard: string;
}

// Which node a concept_id's OWN teaching-order position should be read
// from - the node itself for a plain concept, or the TO node for an
// ::integration one (the connection is only ever tested once the target
// node is already encoded, so its position always falls after both
// endpoints anyway - anchoring to the later one is the natural ordering).
async function resolveSortNode(conceptId: string): Promise<SortNode | null> {
  let lookupConceptId = conceptId;
  if (conceptId.endsWith('::integration')) {
    const withoutSuffix = conceptId.slice(0, -':integration'.length - 1);
    const arrowIndex = withoutSuffix.indexOf('->');
    if (arrowIndex === -1) return null;
    lookupConceptId = withoutSuffix.slice(arrowIndex + 2);
  }
  const { data: node } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('id, label, subtopic, subject, qualification, exam_board')
    .eq('concept_id', lookupConceptId)
    .maybeSingle();
  if (!node) return null;
  return {
    id: node.id as string,
    label: node.label as string,
    subtopic: (node.subtopic as string) || '',
    subject: node.subject as string,
    qualification: node.qualification as string,
    examBoard: node.exam_board as string,
  };
}

// Orders due Day-1 checks the same way their lessons were originally
// taught - subtopic first (spec order, via compareSubtopics), then each
// subtopic's own genuine teaching order (getOrComputeSubtopicOrder, the
// same cached per-subtopic sequence the Notes page and knowledge-map
// sidebar already use) - deliberately NOT the immediate-recall/FSRS
// priority scheduling those use elsewhere; a Day-1 check should never
// have its own recall cascade beyond the single immediate one (e.g. the
// 2-minute check), so there is no "recall priority" for it to follow in
// the first place. A concept whose node can't be resolved (deleted since
// scheduling, or a malformed concept_id) sorts last rather than being
// dropped, so it's still shown somewhere instead of silently vanishing.
export async function orderDay1ChecksByLessonOrder<T extends { conceptId: string }>(checks: T[]): Promise<T[]> {
  const sortNodes = await Promise.all(checks.map((c) => resolveSortNode(c.conceptId)));

  const bySubtopicKey = new Map<string, SortNode[]>();
  sortNodes.forEach((n) => {
    if (!n) return;
    const key = `${n.subject}::${n.qualification}::${n.examBoard}::${n.subtopic}`;
    if (!bySubtopicKey.has(key)) bySubtopicKey.set(key, []);
    bySubtopicKey.get(key)!.push(n);
  });

  const withinSubtopicRank = new Map<string, number>();
  await Promise.all(
    Array.from(bySubtopicKey.entries()).map(async ([, nodes]) => {
      const first = nodes[0];
      const order = await getOrComputeSubtopicOrder(
        first.subject,
        first.qualification,
        first.examBoard,
        first.subtopic,
        nodes.map((n) => ({ id: n.id, label: n.label }))
      );
      order.forEach((nodeId, i) => withinSubtopicRank.set(nodeId, i));
    })
  );

  const rankOf = (index: number): [number, string, number] => {
    const n = sortNodes[index];
    if (!n) return [Number.MAX_SAFE_INTEGER, '', Number.MAX_SAFE_INTEGER];
    return [0, n.subtopic, withinSubtopicRank.get(n.id) ?? Number.MAX_SAFE_INTEGER];
  };

  return checks
    .map((check, index) => ({ check, index }))
    .sort((a, b) => {
      const [aMissing, aSubtopic, aRank] = rankOf(a.index);
      const [bMissing, bSubtopic, bRank] = rankOf(b.index);
      if (aMissing !== bMissing) return aMissing - bMissing;
      const subtopicCmp = compareSubtopics(aSubtopic, bSubtopic);
      if (subtopicCmp !== 0) return subtopicCmp;
      return aRank - bRank;
    })
    .map((entry) => entry.check);
}
