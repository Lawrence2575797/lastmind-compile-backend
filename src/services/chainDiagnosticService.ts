// The knowledge-map "jump ahead" gate — a student trying to start a
// lesson whose prerequisites they haven't covered is tested on the whole
// unmastered chain via ONE combined free-text question (not a per-node
// checkbox wizard), then walked through a slip-vs-genuine-gap self-report
// for anything they got wrong, exactly as designed: encoding checks
// (definitions), transfer checks (identifying that two concepts connect),
// and integration checks (explaining the mechanism between them). A
// genuine gap denies access to the target and redirects to the specific
// failing lesson instead.
//
// State is round-tripped through the client, same convention as
// diagnosticOrchestrator.ts — but unlike that engine's client state, this
// one NEVER embeds ground truth (node explanations / edge link-teaching
// content) in what goes back to the browser. Only ids travel; ground
// truth is always re-fetched server-side by id when needed, the same
// discipline the math diagnostic path already uses for its verified
// solutions.
import { supabaseAdmin } from './supabaseAdmin';
import { selectAllRows } from './supabasePagination';
import { callClaudeJSON, MODELS } from './claudeClient';
import { getMasteryDetailsForConcepts, gradeCorrectness } from './reviewService';
import {
  CHAIN_DIAGNOSTIC_QUESTION_PROMPT,
  CHAIN_DIAGNOSTIC_GRADE_PROMPT,
  CHAIN_DIAGNOSTIC_SLIP_RETRY_QUESTION_PROMPT,
  CHAIN_DIAGNOSTIC_SLIP_RETRY_GRADE_PROMPT,
} from '../constants/chainDiagnosticPrompts';

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}
function extractJsonValue(text: string): string {
  const objStart = text.indexOf('{');
  const arrStart = text.indexOf('[');
  const start = objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart);
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (start === -1 || end === -1 || end <= start) return text;
  return text.slice(start, end + 1);
}
async function callJSON<T>(systemPrompt: string, userContent: string, model: string, temperature = 0.2): Promise<T> {
  const raw = await callClaudeJSON({ model, systemPrompt, userContent, temperature });
  const cleaned = stripCodeFences(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    try {
      return JSON.parse(extractJsonValue(cleaned)) as T;
    } catch (err) {
      console.error('LastMind: chain diagnostic call returned invalid JSON.', { raw });
      throw err;
    }
  }
}

export type ComponentType = 'encoding' | 'transfer' | 'integration';

// componentId encodes everything needed to re-fetch its own ground truth
// server-side, so it's the only thing that ever needs to travel — no
// ground-truth text is ever put in client-held state.
export function encodingComponentId(nodeId: string): string {
  return `encoding:${nodeId}`;
}
export function edgeComponentId(type: 'transfer' | 'integration', edgeId: string): string {
  return `${type}:${edgeId}`;
}
function parseComponentId(componentId: string): { type: ComponentType; refId: string } {
  const sep = componentId.indexOf(':');
  return { type: componentId.slice(0, sep) as ComponentType, refId: componentId.slice(sep + 1) };
}

interface ResolvedComponent {
  componentId: string;
  type: ComponentType;
  label: string; // display label, safe to show
  groundTruth: string; // NEVER sent to the client
  conceptId: string; // FSRS grading key
}

interface GapResult {
  targetLabel: string;
  componentIds: string[]; // ordered: encoding checks then edge checks, in chain (topological) order
}

/**
 * Walks the knowledge-map graph backward from the target node, collecting
 * every ancestor that ISN'T yet mastered — stopping each branch's walk at
 * the first mastered ancestor (mastery already implies its own
 * prerequisites were covered when it was learned, so there's no need to
 * keep testing beyond it). Returns componentIds only (ids, never ground
 * truth) in topological (earliest-prerequisite-first) order. An empty
 * componentIds list means no gap — the caller should let the student
 * straight into the target lesson, no diagnostic needed.
 */
export async function findPrerequisiteGap(
  userId: string,
  targetNodeId: string,
  subject: string,
  qualification: string,
  examBoard: string
): Promise<GapResult | null> {
  const nodeRows = await selectAllRows<{ id: string; concept_id: string; label: string; subtopic: string }>(
    'knowledge_map_nodes',
    'id, concept_id, label, subtopic',
    (q) => q.eq('subject', subject).eq('qualification', qualification).eq('exam_board', examBoard)
  );
  const nodeById = new Map(nodeRows.map((n) => [n.id, n]));
  const targetRow = nodeById.get(targetNodeId);
  if (!targetRow) return null;

  // Fetched with no id filter (a large .in() list itself triggers a "Bad
  // Request" — see supabasePagination.ts) and filtered down to this
  // subject's own edges below, same pattern getKnowledgeMapForSubject uses.
  const allEdgeRows = await selectAllRows<{ id: string; from_node_id: string; to_node_id: string }>(
    'knowledge_map_edges',
    'id, from_node_id, to_node_id'
  );
  const edgeRows = allEdgeRows.filter((e) => nodeById.has(e.from_node_id) && nodeById.has(e.to_node_id));

  const incoming = new Map<string, { edgeId: string; from: string }[]>();
  edgeRows.forEach((e) => {
    const list = incoming.get(e.to_node_id) || [];
    list.push({ edgeId: e.id, from: e.from_node_id });
    incoming.set(e.to_node_id, list);
  });

  // Pass 1: full ancestor closure, capped — just to know who to check
  // mastery for, not yet the actual gap decision.
  const MAX_ANCESTORS = 300;
  const ancestorIds = new Set<string>();
  const closureQueue = [targetNodeId];
  while (closureQueue.length && ancestorIds.size < MAX_ANCESTORS) {
    const cur = closureQueue.shift()!;
    for (const { from } of incoming.get(cur) || []) {
      if (!ancestorIds.has(from)) {
        ancestorIds.add(from);
        closureQueue.push(from);
      }
    }
  }
  if (!ancestorIds.size) return { targetLabel: targetRow.label as string, componentIds: [] };

  const ancestorConceptIds = Array.from(ancestorIds).map((id) => nodeById.get(id)!.concept_id as string);
  const masteryByConceptId = await getMasteryDetailsForConcepts(userId, ancestorConceptIds);

  // Pass 2: BFS backward again, this time stopping at any mastered node.
  const gapNodeIds = new Set<string>();
  const visited = new Set<string>([targetNodeId]);
  const queue = [targetNodeId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const { from } of incoming.get(cur) || []) {
      if (visited.has(from)) continue;
      visited.add(from);
      const conceptId = nodeById.get(from)!.concept_id as string;
      const isMastered = masteryByConceptId.get(conceptId)?.state === 2;
      if (isMastered) continue;
      gapNodeIds.add(from);
      queue.push(from);
    }
  }
  if (!gapNodeIds.size) return { targetLabel: targetRow.label as string, componentIds: [] };

  // Topologically order the gap subgraph (earliest prerequisite first) via
  // Kahn's algorithm restricted to gap nodes + the target, so the combined
  // question and its component list read in real teaching order.
  const gapPlusTarget = new Set([...gapNodeIds, targetNodeId]);
  const gapEdges = edgeRows.filter((e) => gapPlusTarget.has(e.from_node_id) && gapPlusTarget.has(e.to_node_id));
  const inDegree = new Map<string, number>();
  const outAdj = new Map<string, string[]>();
  gapPlusTarget.forEach((id) => inDegree.set(id, 0));
  gapEdges.forEach((e) => {
    inDegree.set(e.to_node_id, (inDegree.get(e.to_node_id) || 0) + 1);
    outAdj.set(e.from_node_id, [...(outAdj.get(e.from_node_id) || []), e.to_node_id]);
  });
  const topoOrder: string[] = [];
  const readyQueue = Array.from(gapPlusTarget).filter((id) => (inDegree.get(id) || 0) === 0);
  while (readyQueue.length) {
    const cur = readyQueue.shift()!;
    topoOrder.push(cur);
    for (const next of outAdj.get(cur) || []) {
      inDegree.set(next, (inDegree.get(next) || 0) - 1);
      if (inDegree.get(next) === 0) readyQueue.push(next);
    }
  }

  const componentIds: string[] = [];
  topoOrder.forEach((nodeId) => {
    if (gapNodeIds.has(nodeId)) componentIds.push(encodingComponentId(nodeId));
  });
  gapEdges.forEach((e) => {
    // Both endpoints already known to be in gapPlusTarget by construction.
    componentIds.push(edgeComponentId('transfer', e.id));
    componentIds.push(edgeComponentId('integration', e.id));
  });

  return { targetLabel: targetRow.label as string, componentIds };
}

/** Re-fetches one component's ground truth + display label + FSRS key by id. Never cached client-side. */
async function resolveComponent(componentId: string): Promise<ResolvedComponent | null> {
  const { type, refId } = parseComponentId(componentId);
  if (type === 'encoding') {
    const { data: node, error } = await supabaseAdmin
      .from('knowledge_map_nodes')
      .select('id, concept_id, label')
      .eq('id', refId)
      .maybeSingle();
    if (error) throw error;
    if (!node) return null;
    const { data: lesson } = await supabaseAdmin
      .from('knowledge_map_node_lessons')
      .select('encoding_content')
      .eq('node_id', refId)
      .maybeSingle();
    const explanation = (lesson?.encoding_content as { explanation?: string } | null)?.explanation || '';
    return { componentId, type, label: node.label as string, groundTruth: explanation, conceptId: node.concept_id as string };
  }

  // transfer / integration — both keyed off the same edge and the same
  // linkTeaching ground truth, differing only in what the grading prompt
  // looks for (see CHAIN_DIAGNOSTIC_GRADE_PROMPT rules 4-5).
  const { data: edge, error } = await supabaseAdmin
    .from('knowledge_map_edges')
    .select('id, from_node_id, to_node_id')
    .eq('id', refId)
    .maybeSingle();
  if (error) throw error;
  if (!edge) return null;
  const [{ data: fromNode }, { data: toNode }, { data: lesson }] = await Promise.all([
    supabaseAdmin.from('knowledge_map_nodes').select('label, concept_id').eq('id', edge.from_node_id).maybeSingle(),
    supabaseAdmin.from('knowledge_map_nodes').select('label, concept_id').eq('id', edge.to_node_id).maybeSingle(),
    supabaseAdmin.from('knowledge_map_edge_lessons').select('link_teaching_content').eq('edge_id', refId).maybeSingle(),
  ]);
  if (!fromNode || !toNode) return null;
  const linkTeaching = (lesson?.link_teaching_content as string) || '';
  return {
    componentId,
    type,
    label: `${fromNode.label} → ${toNode.label}`,
    groundTruth: linkTeaching,
    conceptId: `${fromNode.concept_id}->${toNode.concept_id}`,
  };
}

export interface ChainDiagnosticQuestion {
  componentIds: string[];
  questionText: string;
}

export async function generateChainDiagnosticQuestion(targetLabel: string, componentIds: string[]): Promise<ChainDiagnosticQuestion> {
  const components = (await Promise.all(componentIds.map(resolveComponent))).filter((c): c is ResolvedComponent => !!c);
  // Only the encoding + integration components carry genuinely distinct
  // ground truth worth showing the question-writer (transfer shares the
  // same link-teaching text as integration for the same edge) — but every
  // component still needs to be TESTED, so dedupe only for the prompt's
  // own input, not the returned componentIds.
  const chainForPrompt = components
    .filter((c) => c.type !== 'transfer') // integration's entry already carries the same edge's ground truth
    .map((c) => `[${c.type}] ${c.label}\nReference (never reveal): ${c.groundTruth}`)
    .join('\n\n');

  const { questionText } = await callJSON<{ questionText: string }>(
    CHAIN_DIAGNOSTIC_QUESTION_PROMPT,
    `Target concept (context only, never explain its own content): ${targetLabel}\n\nOrdered chain the student is skipping:\n${chainForPrompt}`,
    MODELS.diagnosticTree,
    0.3
  );
  return { componentIds, questionText };
}

export interface ChainDiagnosticGradeOutcome {
  componentId: string;
  type: ComponentType;
  label: string;
  correct: boolean;
  feedback: string;
}

export async function gradeChainDiagnosticAnswer(
  componentIds: string[],
  questionText: string,
  answer: string
): Promise<ChainDiagnosticGradeOutcome[]> {
  const components = (await Promise.all(componentIds.map(resolveComponent))).filter((c): c is ResolvedComponent => !!c);
  const numbered = components
    .map((c, i) => `${i + 1}. [${c.type}] ${c.label}\nReference (never reveal): ${c.groundTruth}`)
    .join('\n\n');

  const { results } = await callJSON<{ results: { correct: boolean; feedback: string }[] }>(
    CHAIN_DIAGNOSTIC_GRADE_PROMPT,
    `Question the student was asked:\n${questionText}\n\nStudent's answer:\n${answer}\n\nComponents to check, in order:\n${numbered}`,
    MODELS.diagnosticTree,
    0.1
  );

  return components.map((c, i) => ({
    componentId: c.componentId,
    type: c.type,
    label: c.label,
    correct: results[i]?.correct ?? false,
    feedback: results[i]?.feedback || '',
  }));
}

export async function generateSlipRetryQuestion(componentId: string, originalAnswer: string, originalFeedback: string): Promise<string> {
  const component = await resolveComponent(componentId);
  if (!component) throw new Error('component not found');
  const { questionText } = await callJSON<{ questionText: string }>(
    CHAIN_DIAGNOSTIC_SLIP_RETRY_QUESTION_PROMPT,
    `Check type: ${component.type}\nConcept(s): ${component.label}\nReference (never reveal): ${component.groundTruth}\nStudent's original wrong answer: ${originalAnswer}\nFeedback they were given: ${originalFeedback}`,
    MODELS.simpleQuestion,
    0.3
  );
  return questionText;
}

export async function gradeSlipRetryAnswer(componentId: string, retryQuestion: string, answer: string): Promise<{ correct: boolean; feedback: string }> {
  const component = await resolveComponent(componentId);
  if (!component) throw new Error('component not found');
  return callJSON<{ correct: boolean; feedback: string }>(
    CHAIN_DIAGNOSTIC_SLIP_RETRY_GRADE_PROMPT,
    `Check type: ${component.type}\nConcept(s): ${component.label}\nReference (never reveal): ${component.groundTruth}\nQuestion asked: ${retryQuestion}\nStudent's answer: ${answer}`,
    MODELS.simpleQuestion,
    0.1
  );
}

/** FSRS-grades one resolved component — 'again' for a genuine gap, otherwise routed through gradeCorrectness (hadRetry=true for a slip-then-correct pass, so it reads 'hard' rather than looking identical to a clean first-try pass). */
export async function gradeComponentOutcome(userId: string, componentId: string, outcome: 'correct' | 'slip_confirmed' | 'genuine_gap'): Promise<void> {
  const component = await resolveComponent(componentId);
  if (!component) return;
  if (outcome === 'genuine_gap') {
    await gradeCorrectness(userId, component.conceptId, false);
  } else {
    await gradeCorrectness(userId, component.conceptId, true, outcome === 'slip_confirmed');
  }
}

/** Redirect target for a genuine gap — the node's own lesson for an 'encoding' failure, or the edge's from/to pair for a 'transfer'/'integration' failure (the Start Lesson bridge already teaches exactly this link). */
export async function redirectForComponent(componentId: string): Promise<{ type: 'node'; nodeId: string; label: string } | { type: 'edge'; fromNodeId: string; toNodeId: string; label: string } | null> {
  const { type, refId } = parseComponentId(componentId);
  if (type === 'encoding') {
    const { data: node } = await supabaseAdmin.from('knowledge_map_nodes').select('id, label').eq('id', refId).maybeSingle();
    if (!node) return null;
    return { type: 'node', nodeId: node.id as string, label: node.label as string };
  }
  const { data: edge } = await supabaseAdmin.from('knowledge_map_edges').select('from_node_id, to_node_id').eq('id', refId).maybeSingle();
  if (!edge) return null;
  const [{ data: fromNode }, { data: toNode }] = await Promise.all([
    supabaseAdmin.from('knowledge_map_nodes').select('label').eq('id', edge.from_node_id).maybeSingle(),
    supabaseAdmin.from('knowledge_map_nodes').select('label').eq('id', edge.to_node_id).maybeSingle(),
  ]);
  return {
    type: 'edge',
    fromNodeId: edge.from_node_id as string,
    toNodeId: edge.to_node_id as string,
    label: `${fromNode?.label || '?'} → ${toNode?.label || '?'}`,
  };
}
