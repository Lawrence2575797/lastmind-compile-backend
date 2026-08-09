import { callClaudeJSON, MODELS } from './claudeClient';
import { getOrGenerateChain } from './chainService';
import {
  ENCODING_LESSON_BATCH_PROMPT,
  ENCODING_ANSWER_CHECK_PROMPT,
  ENCODING_DRAFT_CHECK_PROMPT,
} from '../constants/encodingLessonPrompts';

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

async function callJSON<T>(systemPrompt: string, userContent: string, model: string, temperature = 0): Promise<T> {
  const raw = await callClaudeJSON({ model, systemPrompt, userContent, temperature });
  return JSON.parse(stripCodeFences(raw)) as T;
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
}

export interface EncodingStartResult {
  done: false;
  hookFact: string;
  step: EncodingStep;
  state: EncodingLessonState;
}

export interface EncodingSubmitResult {
  done: boolean;
  advanced?: boolean;
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

  const batch = await callJSON<{ hookFact: string; steps: { nodeId: string; type: EncodingStepType; text: string }[] }>(
    ENCODING_LESSON_BATCH_PROMPT,
    `Subject: ${subject}\nChain (forward order, leaf-first, target last):\n${JSON.stringify(chainDescription)}`,
    MODELS.diagnosticTree,
    0.4
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

  const state: EncodingLessonState = { conceptKey, subject, steps, currentIndex: 0 };
  return { done: false, hookFact: batch.hookFact, step: steps[0], state };
}

/**
 * Advances the lesson by one step. "explain" steps are direct teaching,
 * not a question — acknowledging one costs no Claude call at all. "scene"
 * and "derive" steps need one grading call, which returns both the
 * correct/incorrect verdict and (if wrong) non-revealing feedback in the
 * same response — a wrong answer keeps the student on the SAME step
 * (advanced: false) rather than costing a second call to regenerate
 * anything, since the step's text was already generated up front.
 */
export async function submitEncodingAnswer(state: EncodingLessonState, answer: string): Promise<EncodingSubmitResult> {
  const currentStep = state.steps[state.currentIndex];
  if (!currentStep) {
    return { done: true, state };
  }

  if (currentStep.type !== 'explain') {
    const check = await callJSON<{ correct: boolean; feedback: string | null }>(
      ENCODING_ANSWER_CHECK_PROMPT,
      `Concept/step: ${currentStep.label}\nPrompt: ${currentStep.text}\nStudent's answer: ${answer}`,
      MODELS.diagnosticTree,
      0.2
    );

    if (!check.correct) {
      return { done: false, advanced: false, correct: false, feedback: check.feedback, state };
    }
  }

  const nextIndex = state.currentIndex + 1;
  const nextState: EncodingLessonState = { ...state, currentIndex: nextIndex };

  if (nextIndex >= state.steps.length) {
    return { done: true, advanced: true, correct: true, state: nextState };
  }

  return { done: false, advanced: true, correct: true, step: state.steps[nextIndex], state: nextState };
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
