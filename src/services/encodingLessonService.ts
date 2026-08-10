import { callClaudeJSON, callClaudeJSONWithImages, MODELS } from './claudeClient';
import { getOrGenerateChain } from './chainService';
import { gradeAndRecordReview } from './reviewService';
import { searchWikimediaImages, fetchImageAsBase64 } from './wikimediaService';
import { supabaseAdmin } from './supabaseAdmin';
import {
  ENCODING_LESSON_BATCH_PROMPT,
  ENCODING_ANSWER_CHECK_PROMPT,
  DIAGRAM_VERIFICATION_PROMPT,
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

export type EncodingStepType = 'check' | 'scene' | 'derive' | 'explain' | 'implication';

export interface EncodingDiagram {
  diagramUrl: string;
  diagramCaption: string;
  diagramAttribution: string;
}

export interface EncodingStep {
  nodeId: string;
  label: string;
  type: EncodingStepType;
  text: string;
  checkQuestion?: string;
  diagram?: EncodingDiagram;
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

function clean(s: string): string {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

const DIAGRAM_LOOKUP_TIMEOUT_MS = 8000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

function buildAttribution(artist: string | null, licenseShortName: string | null): string {
  if (artist && licenseShortName) return `${artist} — ${licenseShortName}, via Wikimedia Commons`;
  if (artist) return `${artist}, via Wikimedia Commons`;
  return 'Via Wikimedia Commons';
}

/**
 * Looks up (or fetches + verifies + caches) a diagram for one concept, keyed
 * by concept + qualification + exam board so only the first student per
 * combination pays the search+vision cost — everyone after gets an instant
 * cache hit, including a cached "nothing suitable" negative. Never throws:
 * any failure just means no diagram, since a missing diagram is harmless
 * but a wrong one would actively mislead a student.
 */
async function getOrFetchDiagram(
  conceptKey: string,
  qualification: string,
  examBoard: string,
  subject: string,
  targetLabel: string,
  searchQuery: string
): Promise<EncodingDiagram | null> {
  const diagramKey = `${conceptKey}::${clean(qualification)}::${clean(examBoard)}`;

  const { data: cached, error: cacheError } = await supabaseAdmin
    .from('encoding_diagrams')
    .select('diagram')
    .eq('diagram_key', diagramKey)
    .maybeSingle();
  if (!cacheError && cached) {
    return (cached.diagram as EncodingDiagram | null) ?? null;
  }

  const candidates = await searchWikimediaImages(searchQuery, 5);
  if (!candidates.length) {
    await supabaseAdmin.from('encoding_diagrams').insert({ diagram_key: diagramKey, diagram: null });
    return null;
  }

  const fetched = await Promise.allSettled(candidates.map((c) => fetchImageAsBase64(c.thumbUrl)));
  const usable = candidates
    .map((c, i) => ({ candidate: c, image: fetched[i].status === 'fulfilled' ? (fetched[i] as PromiseFulfilledResult<any>).value : null }))
    .filter((x) => x.image);

  if (!usable.length) {
    // Transient (network/size) failure across every candidate, not a
    // definitive "no suitable diagram exists" verdict — don't cache this,
    // let the next student's request try again fresh.
    return null;
  }

  const raw = await callClaudeJSONWithImages({
    model: MODELS.diagnosticTree,
    systemPrompt: DIAGRAM_VERIFICATION_PROMPT,
    userText: [
      `Subject: ${subject}`,
      `Qualification: ${qualification || 'unspecified'}`,
      `Exam board: ${examBoard || 'unspecified'}`,
      `Target concept this diagram is meant to illustrate: ${targetLabel}`,
    ].join('\n'),
    images: usable.map((u, i) => ({
      mediaType: u.image.mediaType,
      base64Data: u.image.base64Data,
      label: `Candidate ${i}: ${u.candidate.title}`,
    })),
    temperature: 0.2,
    maxTokens: 512,
  });

  let parsedVerdict: { chosenIndex: number | null; caption: string | null };
  try {
    parsedVerdict = JSON.parse(stripCodeFences(raw));
  } catch (err) {
    console.error('LastMind: diagram verification call returned invalid JSON.', { raw });
    return null;
  }

  if (parsedVerdict.chosenIndex === null || parsedVerdict.chosenIndex === undefined || !usable[parsedVerdict.chosenIndex]) {
    await supabaseAdmin.from('encoding_diagrams').insert({ diagram_key: diagramKey, diagram: null });
    return null;
  }

  const chosen = usable[parsedVerdict.chosenIndex].candidate;
  const diagram: EncodingDiagram = {
    diagramUrl: chosen.thumbUrl,
    diagramCaption: parsedVerdict.caption || '',
    diagramAttribution: buildAttribution(chosen.artist, chosen.licenseShortName),
  };

  await supabaseAdmin.from('encoding_diagrams').insert({ diagram_key: diagramKey, diagram });
  return diagram;
}

/**
 * Starts a first-time "encoding" lesson. Shape: a novelty hook fact, a
 * short knowledge-check of the target concept's DIRECT prerequisites only
 * (assumed prior knowledge — verified, not re-taught), a scene + derivation
 * of the target concept itself, then 1-3 steps exploring its real
 * implications/trade-offs. Distant/foundational chain nodes are neither
 * tested nor individually walked — they're passed to the generation call
 * as background context only, so the lesson doesn't re-teach material
 * covered in earlier lessons or drift into testing prerequisites far from
 * the actual new content. Everything presentable is generated in ONE call
 * up front — grading each answer, and (rarely) a diagram lookup, are the
 * only things that happen afterward.
 */
export async function startEncodingLesson(
  conceptKey: string,
  subject: string,
  topic: string,
  concept: string,
  qualification = '',
  examBoard = ''
): Promise<EncodingStartResult> {
  const chainResult = await getOrGenerateChain(conceptKey, subject, topic, concept);
  if (!chainResult.chain) {
    throw new Error('Could not generate a dependency chain for this concept.');
  }
  const chain = chainResult.chain as Chain;

  const target = chain.nodes[chain.nodes.length - 1];
  const targetDerivable = resolveDerivable(target);

  const closeIds = new Set((target.depends_on || []).map((d) => d.node_id));
  const closeNodes = chain.nodes.filter((n) => closeIds.has(n.id)).slice(0, 3);
  const coveredIds = new Set([...closeNodes.map((n) => n.id), target.id]);
  const backgroundNodes = chain.nodes.filter((n) => !coveredIds.has(n.id));

  const batch = await callJSON<{
    hookFact: string;
    steps: { nodeId: string; type: EncodingStepType; text: string; checkQuestion?: string }[];
    diagram?: { needed: boolean; searchQuery: string | null };
  }>(
    ENCODING_LESSON_BATCH_PROMPT,
    [
      `Subject: ${subject}`,
      `Topic: ${topic || 'unspecified'}`,
      `Qualification: ${qualification || 'unspecified'}`,
      `Exam board: ${examBoard || 'unspecified'}`,
      `Target concept (this exact lesson — every step must build toward THIS, not a related or more general concept): ${target?.label || concept}`,
      `Target concept is derivable from its close prerequisites: ${targetDerivable}`,
      `closePrerequisites (write one "check" step per node, in this order): ${JSON.stringify(closeNodes.map((n) => ({ nodeId: n.id, label: n.label })))}`,
      `backgroundContext (already covered earlier — reference only, do not test, do not write a step): ${JSON.stringify(backgroundNodes.map((n) => ({ nodeId: n.id, label: n.label })))}`,
    ].join('\n'),
    MODELS.diagnosticTree,
    0.4,
    4096
  );

  const nodesById = new Map(chain.nodes.map((n) => [n.id, n]));
  const steps: EncodingStep[] = (batch.steps || []).map((s) => ({
    nodeId: s.nodeId,
    label: nodesById.get(s.nodeId)?.label || (s.type === 'implication' ? `${target.label} — implications` : s.nodeId),
    type: s.type,
    text: s.text,
    checkQuestion: s.checkQuestion,
  }));

  if (!steps.length) {
    throw new Error('Could not generate lesson content for this concept.');
  }

  if (batch.diagram?.needed && batch.diagram.searchQuery) {
    const diagram = await withTimeout(
      getOrFetchDiagram(conceptKey, qualification, examBoard, subject, target.label, batch.diagram.searchQuery).catch((err) => {
        console.error('LastMind: diagram lookup failed, proceeding without one.', err);
        return null;
      }),
      DIAGRAM_LOOKUP_TIMEOUT_MS
    );
    if (diagram) {
      const targetStep = steps.find((s) => s.nodeId === target.id && (s.type === 'derive' || s.type === 'explain'));
      if (targetStep) targetStep.diagram = diagram;
    }
  }

  const state: EncodingLessonState = { conceptKey, subject, steps, currentIndex: 0, anyWeakSoFar: false };
  return { done: false, hookFact: batch.hookFact, step: steps[0], state };
}

/**
 * Advances the lesson by one step. ALWAYS advances, regardless of the
 * answer's quality — this is a first-exposure lesson, not a gate, and a
 * student who gets stuck re-litigating one step with an AI grader can't
 * actually finish the lesson. Every step type is graded (one combined
 * call for verdict + feedback) — "check"/"scene"/"derive"/"implication"
 * against the prompt text itself, "explain" against its checkQuestion
 * (this is brand-new content with nothing for FSRS to have already
 * confirmed, so this is the only check that a thin/misunderstood
 * explanation doesn't silently become the shaky foundation for later
 * steps). The verdict only affects: (a) the feedback shown alongside that
 * step, and (b) the FSRS grade recorded for the whole concept once the
 * lesson finishes — any weak step drops the whole lesson to a lower grade,
 * which is exactly what surfaces it sooner in future spaced-repetition
 * sessions, rather than blocking progress now.
 */
export async function submitEncodingAnswer(userId: string, state: EncodingLessonState, answer: string): Promise<EncodingSubmitResult> {
  const currentStep = state.steps[state.currentIndex];
  if (!currentStep) {
    return { done: true, state };
  }

  const gradingPrompt = currentStep.type === 'explain' ? (currentStep.checkQuestion || currentStep.text) : currentStep.text;
  const check = await callJSON<{ correct: boolean; feedback: string | null }>(
    ENCODING_ANSWER_CHECK_PROMPT,
    `Concept/step: ${currentStep.label}\nPrompt: ${gradingPrompt}\nStudent's answer: ${answer}`,
    MODELS.diagnosticTree,
    0.2
  );
  const correct = check.correct;
  const feedback = check.feedback;

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
