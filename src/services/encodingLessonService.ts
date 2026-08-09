import { callClaudeJSON, MODELS } from './claudeClient';
import { getOrGenerateChain } from './chainService';
import { gradeAndRecordReview } from './reviewService';
import {
  ENCODING_LESSON_BATCH_PROMPT,
  ENCODING_ANSWER_CHECK_PROMPT,
  ENCODING_DRAFT_CHECK_PROMPT,
} from '../constants/encodingLessonPrompts';

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

async function callJSON<T>(systemPrompt: string, userContent: string, model: string, temperature = 0, maxTokens?: number): Promise<T> {
  const raw = await callClaudeJSON({ model, systemPrompt, userContent, temperature, maxTokens });
  try {
    return JSON.parse(stripCodeFences(raw)) as T;
  } catch (err) {
    // Logged raw so a truncated/malformed response (the most likely cause
    // of a parse failure here) is actually diagnosable after the fact,
    // instead of just surfacing as an opaque 500 to the client.
    console.error('LastMind: encoding lesson call returned invalid JSON.', { raw });
    throw err;
  }
}

interface ChainEdge { node_id: string; relationship: 'definitional' | 'reasoning'; }
interface ChainNode { id: string; label: string; derivable?: boolean; depends_on: ChainEdge[]; }
interface Chain { concept_id: string; subject: string; nodes: ChainNode[]; }

export type EncodingStepType = 'scene' | 'derive' | 'explain';

export interface EncodingStep {
  nodeId: string;
  label: string;
  type: EncodingStepType;
  text: string;
}

export interface EncodingLessonState {
  conceptKey: string;
  subject: string;
  steps: EncodingStep[];
  currentIndex: number;
  anyWeakSoFar: boolean;
}

export interface EncodingStartResult {
  done: false;
  hookFact: string;
  step: EncodingStep;
  state: EncodingLessonState;
}

export interface EncodingSubmitResult {
  done: boolean;
  correct?: boolean;
  feedback?: string | null;
  step?: EncodingStep;
  state: EncodingLessonState;
}

// Chains cached before the "derivable" field existed default to: a node
// with no prerequisites of its own can't be derived from anything else in
// the chain, so it's treated as non-derivable; anything with prerequisites
// is treated as derivable — matches the field's own intent without forcing
// every existing cached chain to regenerate.
function resolveDerivable(node: ChainNode): boolean {
  if (typeof node.derivable === 'boolean') return node.derivable;
  return (node.depends_on || []).length > 0;
}

/**
 * Starts a first-time "encoding" lesson — a genuinely different shape from
 * the retrieval chain-lesson engine in spacedLessonEngine.ts. Walks the
 * concept's dependency chain FORWARD (leaf prerequisites first, building
 * toward the new target concept, which is always the chain's last node),
 * asking the student to derive each derivable step themselves rather than
 * being told it, with direct explanations only for the genuinely
 * non-derivable steps. Everything presentable is generated in ONE call
 * up front (the hook fact plus every step's text) — grading each answer
 * is the only thing that has to wait for the student's actual response.
 */
export async function startEncodingLesson(
  conceptKey: string,
  subject: string,
  topic: string,
  concept: string
): Promise<EncodingStartResult> {
  const chainResult = await getOrGenerateChain(conceptKey, subject, topic, concept);
  if (!chainResult.chain) {
    throw new Error('Could not generate a dependency chain for this concept.');
  }
  const chain = chainResult.chain as Chain;

  const chainDescription = chain.nodes.map((n, i) => ({
    nodeId: n.id,
    label: n.label,
    // The first node always becomes a "scene" step regardless of its own
    // derivable flag, so what we tell the model here doesn't matter for
    // it — kept accurate anyway for the rest of the chain.
    derivable: i === 0 ? false : resolveDerivable(n),
  }));

  const target = chain.nodes[chain.nodes.length - 1];
  const batch = await callJSON<{ hookFact: string; steps: { nodeId: string; type: EncodingStepType; text: string }[] }>(
    ENCODING_LESSON_BATCH_PROMPT,
    [
      `Subject: ${subject}`,
      `Topic: ${topic || 'unspecified'}`,
      `Target concept (this exact lesson — every step must build toward THIS, not a related or more general concept): ${target?.label || concept}`,
      `Chain (forward order, leaf-first, target last):\n${JSON.stringify(chainDescription)}`,
    ].join('\n'),
    MODELS.diagnosticTree,
    0.4,
    4096
  );

  const nodesById = new Map(chain.nodes.map((n) => [n.id, n]));
  const steps: EncodingStep[] = (batch.steps || []).map((s) => ({
    nodeId: s.nodeId,
    label: nodesById.get(s.nodeId)?.label || s.nodeId,
    type: s.type,
    text: s.text,
  }));

  if (!steps.length) {
    throw new Error('Could not generate lesson content for this concept.');
  }

  const state: EncodingLessonState = { conceptKey, subject, steps, currentIndex: 0, anyWeakSoFar: false };
  return { done: false, hookFact: batch.hookFact, step: steps[0], state };
}

/**
 * Advances the lesson by one step. ALWAYS advances, regardless of the
 * answer's quality — this is a first-exposure lesson, not a gate, and a
 * student who gets stuck re-litigating one step with an AI grader can't
 * actually finish the lesson. "explain" steps are direct teaching, not a
 * question — acknowledging one costs no Claude call at all. "scene" and
 * "derive" steps still get graded (one combined call for verdict +
 * feedback), but the verdict only affects: (a) the feedback shown
 * alongside that step, and (b) the FSRS grade recorded for the whole
 * concept once the lesson finishes — any weak step drops the whole
 * lesson to a lower grade, which is exactly what surfaces it sooner in
 * future spaced-repetition sessions, rather than blocking progress now.
 */
export async function submitEncodingAnswer(userId: string, state: EncodingLessonState, answer: string): Promise<EncodingSubmitResult> {
  const currentStep = state.steps[state.currentIndex];
  if (!currentStep) {
    return { done: true, state };
  }

  let correct = true;
  let feedback: string | null = null;

  if (currentStep.type !== 'explain') {
    const check = await callJSON<{ correct: boolean; feedback: string | null }>(
      ENCODING_ANSWER_CHECK_PROMPT,
      `Concept/step: ${currentStep.label}\nPrompt: ${currentStep.text}\nStudent's answer: ${answer}`,
      MODELS.diagnosticTree,
      0.2
    );
    correct = check.correct;
    feedback = check.feedback;
  }

  const nextIndex = state.currentIndex + 1;
  const anyWeakSoFar = state.anyWeakSoFar || !correct;
  const nextState: EncodingLessonState = { ...state, currentIndex: nextIndex, anyWeakSoFar };

  if (nextIndex >= state.steps.length) {
    // Same rating scale/table the retrieval engine uses (gradeAndRecordReview
    // -> RATING_MAP), so this concept slots into the exact same FSRS
    // schedule — a rocky first encoding lesson brings it back around sooner.
    await gradeAndRecordReview(userId, state.conceptKey, anyWeakSoFar ? 'hard' : 'easy');
    return { done: true, correct, feedback, state: nextState };
  }

  return { done: false, correct, feedback, step: state.steps[nextIndex], state: nextState };
}

/**
 * The live, while-typing check — deliberately cheap (small model, short
 * input) since the frontend debounces this to fire repeatedly during a
 * single answer draft. Snippets are filtered to only ones that actually
 * appear verbatim in the draft, since the frontend locates them by exact
 * string search.
 */
export async function checkEncodingDraft(
  nodeLabel: string,
  promptText: string,
  draft: string
): Promise<{ flags: { snippet: string; hint: string }[] }> {
  if (!draft || draft.trim().length < 15) return { flags: [] };

  const result = await callJSON<{ flags: { snippet: string; hint: string }[] }>(
    ENCODING_DRAFT_CHECK_PROMPT,
    `Concept/step: ${nodeLabel}\nPrompt: ${promptText}\nCurrent draft: ${draft}`,
    MODELS.simpleQuestion,
    0.2
  );

  const flags = (result.flags || []).filter((f) => f.snippet && draft.includes(f.snippet)).slice(0, 3);
  return { flags };
}
