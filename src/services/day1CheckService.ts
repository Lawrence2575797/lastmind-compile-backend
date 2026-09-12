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
