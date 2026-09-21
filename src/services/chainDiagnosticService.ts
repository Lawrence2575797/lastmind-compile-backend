// The knowledge-map "jump ahead" gate — a student trying to start a
// lesson whose prerequisites they haven't covered is tested on the whole
// unmastered chain via a SEPARATE short question per component (a node's
// own encoding/AO1, or the link between two consecutive concepts), laid
// out as one vertical column per prerequisite chain (side by side when
// the target has more than one), with a single submit button grading
// every box at once. Anything wrong that looks like a silly slip offers
// one focused retry; anything else (declined or still wrong after a
// retry) is a genuine gap — fed into the main feed afterward as a normal,
// completely fresh encoding/integration lesson (see knowledgeMap.ts's
// prereq-check/finalize route), never denied or redirected away from.
//
// State is round-tripped through the client, same convention as
// diagnosticOrchestrator.ts — but this one NEVER embeds ground truth
// (node explanations / edge link-teaching content) in what goes back to
// the browser. Only ids/labels travel; ground truth is always re-fetched
// server-side by id when needed, the same discipline the math diagnostic
// path already uses for its verified solutions.
import { supabaseAdmin } from './supabaseAdmin';
import { selectAllRows } from './supabasePagination';
import { callClaudeJSON, MODELS } from './claudeClient';
import { parseModelJson } from './jsonParsing';
import { resolveSubjectTriple } from './subjectResolution';
import { getMasteryDetailsForConcepts, gradeCorrectness } from './reviewService';
import { linkIntegrationConceptId } from './nodeReviewService';
import { sanitiseStructured, clientView, gradeStructured, isStructured, StructuredQuestion } from './questionFormats';
import {
  PER_STEP_QUESTION_PROMPT,
  PER_STEP_GRADE_PROMPT,
  PER_STEP_RETRY_QUESTION_PROMPT,
  PER_STEP_RETRY_GRADE_PROMPT,
  PerStepGradeResult,
} from '../constants/prerequisiteCheckPrompts';

// Real bug found live in the OLD combined-question design: this file used
// to parse with a plain JSON.parse + one bracket-span fallback of its
// own, instead of the shared parseModelJson (jsonParsing.ts) every other
// Claude-JSON call site in this app already uses - broke the very first
// time a generated question was long enough to contain a literal newline
// between paragraphs. Kept here even though questions are shorter now -
// parseModelJson is strictly more robust, never less.
async function callJSON<T>(systemPrompt: string, userContent: string, model: string, temperature = 0.2, maxTokens?: number, userId?: string, meteredReason?: string): Promise<T> {
  const raw = await callClaudeJSON({ model, systemPrompt, userContent, temperature, maxTokens, userId, meteredReason });
  try {
    return parseModelJson<T>(raw);
  } catch (err) {
    console.error('LastMind: prerequisite check call returned invalid JSON.', { raw });
    throw err;
  }
}

export type StepType = 'encoding' | 'link';

export function encodingComponentId(nodeId: string): string {
  return `encoding:${nodeId}`;
}
export function linkComponentId(edgeId: string): string {
  return `link:${edgeId}`;
}

export interface ChainStep {
  componentId: string;
  type: StepType;
  nodeId?: string; // encoding
  edgeId?: string; fromNodeId?: string; toNodeId?: string; // link
}

interface GapEdge {
  id: string;
  from: string;
  to: string;
}

export interface GapResult {
  targetNodeId: string;
  targetLabel: string;
  gapNodeIds: string[]; // unordered set of ancestor node ids that haven't been encoded at all yet
  gapEdges: GapEdge[]; // every edge among gapNodeIds ∪ {target}
  topoOrder: string[]; // gapNodeIds ∪ {target}, earliest-prerequisite-first
}

/**
 * Walks the knowledge-map graph backward from the target node, collecting
 * every ancestor that HASN'T been encoded at all yet — stopping each
 * branch's walk at the first already-encoded ancestor (having taken that
 * lesson already implies its own prerequisites were covered at the time,
 * so there's no need to keep testing beyond it). This is deliberately not
 * a mastery bar: a concept encoded once but not yet reviewed to mastery
 * has still been taught, and gating on mastery here would keep re-testing
 * a chain the student has already legitimately been through, on every
 * lesson downstream of it, for as long as it takes to reach mastery.
 * An empty gapNodeIds means no gap — the caller should let the student
 * straight into the target lesson, no check needed.
 */
export async function findPrerequisiteGap(
  userId: string,
  targetNodeId: string,
  rawSubject: string,
  rawQualification: string,
  rawExamBoard: string
): Promise<GapResult | null> {
  // Resolves a misspelled/abbreviated typed triple to the real one it's
  // closest to before matching (see resolveSubjectTriple's own comment) -
  // same fix as getKnowledgeMapForSubject in knowledgeMapService.ts, kept
  // consistent here since this gate reads the same knowledge_map_nodes
  // graph for the same folder.
  const { subject, qualification, examBoard } = await resolveSubjectTriple(rawSubject, rawQualification, rawExamBoard);
  const nodeRows = await selectAllRows<{ id: string; concept_id: string; label: string; subtopic: string }>(
    'knowledge_map_nodes',
    'id, concept_id, label, subtopic',
    (q) => q.ilike('subject', subject.trim()).ilike('qualification', qualification.trim()).ilike('exam_board', examBoard.trim())
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
  if (!ancestorIds.size) return { targetNodeId, targetLabel: targetRow.label as string, gapNodeIds: [], gapEdges: [], topoOrder: [] };

  const ancestorConceptIds = Array.from(ancestorIds).map((id) => nodeById.get(id)!.concept_id as string);
  const masteryByConceptId = await getMasteryDetailsForConcepts(userId, ancestorConceptIds);

  // Pass 2: BFS backward again, this time stopping at any already-encoded
  // node — getMasteryDetailsForConcepts only returns an entry for a
  // concept that has at least one concept_reviews row, i.e. has been
  // encoded at least once, regardless of how far it's since progressed
  // toward mastery.
  const gapNodeIds = new Set<string>();
  const visited = new Set<string>([targetNodeId]);
  const queue = [targetNodeId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const { from } of incoming.get(cur) || []) {
      if (visited.has(from)) continue;
      visited.add(from);
      const conceptId = nodeById.get(from)!.concept_id as string;
      const alreadyEncoded = masteryByConceptId.has(conceptId);
      if (alreadyEncoded) continue;
      gapNodeIds.add(from);
      queue.push(from);
    }
  }
  if (!gapNodeIds.size) return { targetNodeId, targetLabel: targetRow.label as string, gapNodeIds: [], gapEdges: [], topoOrder: [] };

  // Topologically order the gap subgraph (earliest prerequisite first) via
  // Kahn's algorithm restricted to gap nodes + the target, so both the
  // chain-building below and the post-check feed-seeding read in real
  // teaching order.
  const gapPlusTarget = new Set([...gapNodeIds, targetNodeId]);
  const gapEdgeRows = edgeRows.filter((e) => gapPlusTarget.has(e.from_node_id) && gapPlusTarget.has(e.to_node_id));
  const inDegree = new Map<string, number>();
  const outAdj = new Map<string, string[]>();
  gapPlusTarget.forEach((id) => inDegree.set(id, 0));
  gapEdgeRows.forEach((e) => {
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

  return {
    targetNodeId,
    targetLabel: targetRow.label as string,
    gapNodeIds: Array.from(gapNodeIds),
    gapEdges: gapEdgeRows.map((e) => ({ id: e.id, from: e.from_node_id, to: e.to_node_id })),
    topoOrder,
  };
}

/**
 * Decomposes the gap subgraph into one or more vertical chains — each a
 * root (a gap node with no unencoded gap-parent) walked FORWARD to the
 * target, alternating an encoding step then the link into the next node.
 * Every gap node's encoding step, and every gap edge's link step, is
 * placed in EXACTLY ONE chain — a node reached from more than one
 * direction (a fan-in) only gets tested once, by whichever chain reaches
 * it first; a node with more than one forward edge (a fan-out) spawns an
 * additional chain per extra edge, starting with just that link step
 * (its OWN encoding already sits in the chain that claimed it) and
 * continuing forward from there. This is what actually produces "more
 * than one vertical chain, shown side by side" for a target with
 * multiple independent prerequisite branches, while never asking the
 * same question twice for a node/edge reached by more than one path.
 */
export function buildPrerequisiteChains(gap: GapResult): ChainStep[][] {
  const gapNodeIdSet = new Set(gap.gapNodeIds);
  const outByNode = new Map<string, GapEdge[]>();
  const inCount = new Map<string, number>();
  gapNodeIdSet.forEach((id) => inCount.set(id, 0));
  gap.gapEdges.forEach((e) => {
    if (!outByNode.has(e.from)) outByNode.set(e.from, []);
    outByNode.get(e.from)!.push(e);
    if (gapNodeIdSet.has(e.to)) inCount.set(e.to, (inCount.get(e.to) || 0) + 1);
  });

  const roots = gap.topoOrder.filter((id) => gapNodeIdSet.has(id) && (inCount.get(id) || 0) === 0);

  const claimedEncoding = new Set<string>();
  const claimedForward = new Set<string>();
  const chains: ChainStep[][] = [];
  type QueueItem = { nodeId: string; entryStep: ChainStep | null };
  const queue: QueueItem[] = roots.map((nodeId) => ({ nodeId, entryStep: null }));

  while (queue.length) {
    const { nodeId, entryStep } = queue.shift()!;
    if (claimedForward.has(nodeId)) {
      // Forward continuation from this node already belongs to another
      // chain (reached first via a different edge), but THIS specific
      // incoming edge still needs its own test — push it as a standalone
      // one-step feeder chain rather than silently dropping it. Without
      // this, a node with two genuinely non-primary incoming edges (a
      // fan-in via extras, not roots) would lose the second edge
      // entirely: never asked, never gradable, never fed into the
      // remediation feed even though it's a real untested prerequisite.
      if (entryStep) chains.push([entryStep]);
      continue;
    }
    claimedForward.add(nodeId);

    const steps: ChainStep[] = [];
    if (entryStep) steps.push(entryStep);
    if (!claimedEncoding.has(nodeId)) {
      steps.push({ componentId: encodingComponentId(nodeId), type: 'encoding', nodeId });
      claimedEncoding.add(nodeId);
    }

    let cur: string | null = nodeId;
    while (cur !== null) {
      const curId: string = cur;
      const outs: GapEdge[] = outByNode.get(curId) || [];
      if (!outs.length) break;
      const primary: GapEdge = outs[0];
      const extras: GapEdge[] = outs.slice(1);
      steps.push({ componentId: linkComponentId(primary.id), type: 'link', edgeId: primary.id, fromNodeId: primary.from, toNodeId: primary.to });
      for (const extra of extras) {
        queue.push({
          nodeId: extra.to,
          entryStep: { componentId: linkComponentId(extra.id), type: 'link', edgeId: extra.id, fromNodeId: extra.from, toNodeId: extra.to },
        });
      }
      if (primary.to === gap.targetNodeId || claimedForward.has(primary.to)) {
        cur = null;
        break;
      }
      const next: string = primary.to;
      claimedForward.add(next);
      if (!claimedEncoding.has(next)) {
        steps.push({ componentId: encodingComponentId(next), type: 'encoding', nodeId: next });
        claimedEncoding.add(next);
      }
      cur = next;
    }
    if (steps.length) chains.push(steps);
  }

  return chains;
}

interface ResolvedStep {
  componentId: string;
  type: StepType;
  label: string; // node label, or "A → B" for a link — display-safe
  fromLabel?: string;
  toLabel?: string;
  groundTruth: string; // NEVER sent to the client
  conceptId: string; // FSRS grading key
}

/** Re-fetches one step's ground truth + display label(s) + FSRS key by id. Never cached client-side. */
async function resolveStep(step: ChainStep): Promise<ResolvedStep | null> {
  if (step.type === 'encoding') {
    const { data: node, error } = await supabaseAdmin
      .from('knowledge_map_nodes')
      .select('id, concept_id, label')
      .eq('id', step.nodeId)
      .maybeSingle();
    if (error) throw error;
    if (!node) return null;
    const { data: lesson } = await supabaseAdmin
      .from('knowledge_map_node_lessons')
      .select('encoding_content')
      .eq('node_id', step.nodeId)
      .maybeSingle();
    const explanation = (lesson?.encoding_content as { explanation?: string } | null)?.explanation || '';
    return { componentId: step.componentId, type: 'encoding', label: node.label as string, groundTruth: explanation, conceptId: node.concept_id as string };
  }

  const { data: edge, error } = await supabaseAdmin
    .from('knowledge_map_edges')
    .select('id, from_node_id, to_node_id')
    .eq('id', step.edgeId)
    .maybeSingle();
  if (error) throw error;
  if (!edge) return null;
  const [{ data: fromNode }, { data: toNode }, { data: lesson }] = await Promise.all([
    supabaseAdmin.from('knowledge_map_nodes').select('label, concept_id').eq('id', edge.from_node_id).maybeSingle(),
    supabaseAdmin.from('knowledge_map_nodes').select('label, concept_id').eq('id', edge.to_node_id).maybeSingle(),
    supabaseAdmin.from('knowledge_map_edge_lessons').select('link_teaching_content').eq('edge_id', step.edgeId).maybeSingle(),
  ]);
  if (!fromNode || !toNode) return null;
  const linkTeaching = (lesson?.link_teaching_content as string) || '';
  return {
    componentId: step.componentId,
    type: 'link',
    label: `${fromNode.label} → ${toNode.label}`,
    fromLabel: fromNode.label as string,
    toLabel: toNode.label as string,
    groundTruth: linkTeaching,
    conceptId: linkIntegrationConceptId(fromNode.concept_id as string, toNode.concept_id as string),
  };
}

export interface ChainStepForClient {
  componentId: string;
  type: StepType;
  label: string;
  fromLabel?: string;
  toLabel?: string;
  questionText: string;
  // Interactive questions (spot the mistake, match, order) carry their puzzle here; the answer key stays on the server.
  format?: string;
  segments?: string[];
  lefts?: string[];
  rights?: string[];
  items?: string[];
}

/**
 * Generates every step's own separate question, across every chain, in
 * ONE batched call — cheaper than one call per step, and keeps the whole
 * set contextually non-repetitive since the model sees them together.
 */
export async function generateChainQuestions(targetLabel: string, chains: ChainStep[][], userId: string): Promise<{ chains: ChainStepForClient[][]; keys: Record<string, StructuredQuestion> }> {
  const flatSteps = chains.flat();
  const resolved = (await Promise.all(flatSteps.map(resolveStep))).filter((r): r is ResolvedStep => !!r);
  const byComponentId = new Map(resolved.map((r) => [r.componentId, r]));

  const inputList = resolved
    .map((r) => `componentId: ${r.componentId}\n[${r.type}] ${r.label}\nReference (never reveal): ${r.groundTruth}`)
    .join('\n\n');
  const { questions } = await callJSON<{ questions: any[] }>(
    PER_STEP_QUESTION_PROMPT,
    `Target concept (context only, never explain its own content): ${targetLabel}\n\nComponents:\n${inputList}`,
    MODELS.diagnosticTree,
    0.3,
    Math.max(3072, flatSteps.length * 700 + 512),
    userId,
    'chain-diagnostic-generate-questions'
  );
  const keys: Record<string, StructuredQuestion> = {};
  const questionByComponentId = new Map<string, string>();
  const viewByComponentId = new Map<string, Record<string, unknown>>();
  for (const q of Array.isArray(questions) ? questions : []) {
    if (!q || typeof q.componentId !== 'string') continue;
    const structured = isStructured(q) ? sanitiseStructured(q) : null;
    if (structured) { keys[q.componentId] = structured; viewByComponentId.set(q.componentId, clientView(structured)); questionByComponentId.set(q.componentId, structured.questionText); }
    else if (typeof q.questionText === 'string' && q.format !== 'spot_mistake' && q.format !== 'match' && q.format !== 'order') questionByComponentId.set(q.componentId, q.questionText);
  }

  const built = chains.map((chain) => {
    const out: ChainStepForClient[] = [];
    for (const step of chain) {
      const r = byComponentId.get(step.componentId);
      if (!r) continue;
      out.push({
        componentId: step.componentId,
        type: step.type,
        label: r.label,
        fromLabel: r.fromLabel,
        toLabel: r.toLabel,
        questionText: questionByComponentId.get(step.componentId) || (step.type === 'encoding' ? `Explain what "${r.label}" means, in your own words.` : `Explain how "${r.fromLabel}" links to "${r.toLabel}".`),
        ...(viewByComponentId.has(step.componentId) ? (({ questionText: _q, ...rest }) => rest)(viewByComponentId.get(step.componentId) as any) : {}),
      });
    }
    return out;
  });
  return { chains: built, keys };
}

/**
 * Grades every step's own separate answer in ONE batched call. Anything
 * correct is graded straight into FSRS here (see gradeStepCorrect) —
 * exactly as a first-time-correct answer currently does, which is also
 * what schedules its Day-1 check. Anything wrong is left ungraded
 * entirely (no premature 'again') — a genuine gap only ever enters FSRS
 * later, via its own completely fresh encoding/integration lesson once
 * fed into the main feed (see knowledgeMap.ts's prereq-check/finalize).
 */
export async function gradeChainAnswers(
  chains: ChainStep[][],
  answers: Record<string, any>,
  userId: string,
  keys: Record<string, StructuredQuestion> = {}
): Promise<PerStepGradeResult[]> {
  const flatSteps = chains.flat();
  const resolved = (await Promise.all(flatSteps.map(resolveStep))).filter((r): r is ResolvedStep => !!r);

  // Interactive steps have one right answer and are graded exactly; only open-text steps (a pure definition) go to the AI.
  const exact: PerStepGradeResult[] = resolved.filter((r) => keys[r.componentId]).map((r) => {
    const g = gradeStructured(keys[r.componentId], answers[r.componentId]);
    return { componentId: r.componentId, correct: g.correct, feedback: g.feedback, sillyMistake: g.correct ? undefined : true, detail: g.detail, reveal: g.reveal };
  });
  const resolvedText = resolved.filter((r) => !keys[r.componentId]);

  const numbered = resolvedText
    .map((r, i) => `${i + 1}. componentId: ${r.componentId}\n[${r.type}] ${r.label}\nReference (never reveal): ${r.groundTruth}\nStudent's answer: ${answers[r.componentId] || '(blank)'}`)
    .join('\n\n');

  const { results } = resolvedText.length
    ? await callJSON<{ results: PerStepGradeResult[] }>(
      PER_STEP_GRADE_PROMPT,
      `Components and answers, in order:\n${numbered}`,
      MODELS.diagnosticTree,
      0.1,
      Math.max(2048, resolvedText.length * 350 + 512),
      userId,
      'chain-diagnostic-grade-answers'
    )
    : { results: [] as PerStepGradeResult[] };
  const resultByComponentId = new Map([...results, ...exact].map((r) => [r.componentId, r]));

  const finalResults: PerStepGradeResult[] = resolved.map((r) => {
    const graded = resultByComponentId.get(r.componentId);
    return {
      componentId: r.componentId,
      correct: graded?.correct ?? false,
      feedback: graded?.feedback || '',
      sillyMistake: graded?.correct ? undefined : graded?.sillyMistake,
      detail: graded?.detail,
      reveal: graded?.reveal,
    };
  });

  await Promise.all(
    finalResults
      .filter((r) => r.correct)
      .map((r) => {
        const step = flatSteps.find((s) => s.componentId === r.componentId)!;
        return gradeStepCorrect(userId, step, 0);
      })
  );

  return finalResults;
}

/** Resolves a step's conceptId and grades it correct — first-try 'good', or 'hard' after one retry (retryCount=1), the exact same rating a normal first-time-correct answer/retry gets elsewhere in this app. */
export async function gradeStepCorrect(userId: string, step: ChainStep, retryCount: number): Promise<void> {
  const resolved = await resolveStep(step);
  if (!resolved) return;
  await gradeCorrectness(userId, resolved.conceptId, true, retryCount);
}

export async function generateStepRetryQuestion(step: ChainStep, originalAnswer: string, originalFeedback: string, userId: string): Promise<string> {
  const resolved = await resolveStep(step);
  if (!resolved) throw new Error('component not found');
  const { questionText } = await callJSON<{ questionText: string }>(
    PER_STEP_RETRY_QUESTION_PROMPT,
    `Check type: ${resolved.type}\nConcept(s): ${resolved.label}\nReference (never reveal): ${resolved.groundTruth}\nStudent's original wrong answer: ${originalAnswer}\nFeedback they were given: ${originalFeedback}`,
    MODELS.simpleQuestion,
    0.3,
    undefined,
    userId,
    'chain-diagnostic-retry-question'
  );
  return questionText;
}

export async function gradeStepRetryAnswer(step: ChainStep, retryQuestion: string, answer: string, userId: string): Promise<{ correct: boolean; feedback: string }> {
  const resolved = await resolveStep(step);
  if (!resolved) throw new Error('component not found');
  return callJSON<{ correct: boolean; feedback: string }>(
    PER_STEP_RETRY_GRADE_PROMPT,
    `Check type: ${resolved.type}\nConcept(s): ${resolved.label}\nReference (never reveal): ${resolved.groundTruth}\nQuestion asked: ${retryQuestion}\nStudent's answer: ${answer}`,
    MODELS.simpleQuestion,
    0.1,
    undefined,
    userId,
    'chain-diagnostic-retry-grade'
  );
}

export interface GapFeedItem {
  type: 'node' | 'link';
  nodeId?: string;
  label?: string;
  fromNodeId?: string;
  toNodeId?: string;
  fromLabel?: string;
  toLabel?: string;
}

/**
 * Orders the genuine-gap componentIds (whatever's still wrong once the
 * check + any silly-mistake retries are done) into the exact sequence
 * they should be fed into the main feed — every gap node's encoding, and
 * every gap edge's link, in real prerequisite (topological) order, so a
 * link step only ever appears once both its endpoints already have a
 * chance to be encoded (either fed in earlier here, or already encoded
 * from before this check ever ran).
 */
export async function buildGapFeedItems(gap: GapResult, genuineGapComponentIds: Set<string>): Promise<GapFeedItem[]> {
  const genuineGapNodeIds = new Set(gap.gapNodeIds.filter((id) => genuineGapComponentIds.has(encodingComponentId(id))));
  const genuineGapEdges = gap.gapEdges.filter((e) => genuineGapComponentIds.has(linkComponentId(e.id)));
  const edgesByTo = new Map<string, GapEdge[]>();
  genuineGapEdges.forEach((e) => {
    if (!edgesByTo.has(e.to)) edgesByTo.set(e.to, []);
    edgesByTo.get(e.to)!.push(e);
  });

  const nodeIdsNeeded = new Set<string>();
  genuineGapNodeIds.forEach((id) => nodeIdsNeeded.add(id));
  genuineGapEdges.forEach((e) => { nodeIdsNeeded.add(e.from); nodeIdsNeeded.add(e.to); });
  const { data: nodeRows } = await supabaseAdmin.from('knowledge_map_nodes').select('id, label').in('id', Array.from(nodeIdsNeeded));
  const labelById = new Map((nodeRows || []).map((n) => [n.id as string, n.label as string]));

  const items: GapFeedItem[] = [];
  for (const nodeId of gap.topoOrder) {
    if (genuineGapNodeIds.has(nodeId)) {
      items.push({ type: 'node', nodeId, label: labelById.get(nodeId) || '' });
    }
    for (const e of edgesByTo.get(nodeId) || []) {
      items.push({ type: 'link', fromNodeId: e.from, toNodeId: e.to, fromLabel: labelById.get(e.from) || '', toLabel: labelById.get(e.to) || '' });
    }
  }
  return items;
}
