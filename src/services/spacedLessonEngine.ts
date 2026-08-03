import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { gradeAndRecordReview } from './reviewService';
import { getOrGenerateChain } from './chainService';
import {
  PREDICTION_ERROR_QUESTION_PROMPT,
  FORWARD_CHUNK_QUESTION_PROMPT,
  CHECK_ANSWER_AND_SLIP_PROMPT,
  CORRECTION_PROMPT,
} from '../constants/diagnosticPrompts';

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

async function callJSON<T>(systemPrompt: string, userContent: string, model: string, temperature = 0): Promise<T> {
  const raw = await callClaudeJSON({ model, systemPrompt, userContent, temperature });
  return JSON.parse(stripCodeFences(raw)) as T;
}

interface ChainEdge { node_id: string; relationship: 'definitional' | 'reasoning'; }
interface ChainNode { id: string; label: string; depends_on: ChainEdge[]; }
interface Chain { concept_id: string; subject: string; nodes: ChainNode[]; }

interface AnswerCheck { correct: boolean; misconceptionNote: string | null; }

async function checkAnswer(conceptLabel: string, questionDescription: string, answer: string): Promise<AnswerCheck> {
  return callJSON<AnswerCheck>(
    CHECK_ANSWER_AND_SLIP_PROMPT,
    `Concept: ${conceptLabel}\nQuestion: ${questionDescription}\nStudent's answer: ${answer}`,
    MODELS.simpleQuestion
  );
}

/**
 * Splits a chain's nodes (already topologically ordered — leaf-first,
 * target last, since that's how chain generation produces them, and a
 * topological order IS a valid teaching order for any dependency graph,
 * branching or not) into progressively larger chunks as review_count
 * grows. Deliberately gradual: jumping straight from "every step
 * separate" to "the whole chain in one go" would risk exactly the
 * working-memory overload this progression exists to avoid.
 *
 * reviewCount 0        -> one node per chunk (fully scaffolded)
 * reviewCount n         -> roughly (totalLinks - n) chunks
 * reviewCount >= totalLinks - 1 -> the whole chain as a single chunk
 */
export function computeChunks(chain: Chain, reviewCount: number): ChainNode[][] {
  const orderedNodes = chain.nodes;
  const totalLinks = orderedNodes.length;
  const targetChunkCount = Math.max(1, totalLinks - reviewCount);

  if (targetChunkCount >= totalLinks) {
    return orderedNodes.map((n) => [n]);
  }

  const chunks: ChainNode[][] = [];
  const baseSize = Math.floor(totalLinks / targetChunkCount);
  let remainder = totalLinks % targetChunkCount;
  let idx = 0;
  for (let i = 0; i < targetChunkCount; i++) {
    const size = baseSize + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    chunks.push(orderedNodes.slice(idx, idx + size));
    idx += size;
  }
  return chunks;
}

async function getReviewCount(userId: string, conceptKey: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('chain_lesson_progress')
    .select('review_count')
    .eq('user_id', userId)
    .eq('concept_key', conceptKey)
    .maybeSingle();
  if (error) throw error;
  return data?.review_count ?? 0;
}

async function incrementReviewCount(userId: string, conceptKey: string, currentCount: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('chain_lesson_progress')
    .upsert(
      { user_id: userId, concept_key: conceptKey, review_count: currentCount + 1, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,concept_key' }
    );
  if (error) throw error;
}

export interface ChunkResult { chunkLabel: string; correct: boolean; correction?: string; }

export interface ChainLessonState {
  conceptKey: string;
  subject: string;
  chain: Chain;
  chunks: ChainNode[][];
  currentChunkIndex: number; // -1 = showing the opening prediction-error question
  results: ChunkResult[];
  anyMisconceptionSoFar: boolean;
}

export interface ChainLessonResult {
  done: boolean;
  nextQuestion?: string;
  inlineCorrection?: string; // shown alongside the NEXT question, addressing the PREVIOUS chunk's error
  summary?: ChunkResult[];
  state: ChainLessonState;
}

function chunkLabel(chunk: ChainNode[]): string {
  return chunk.map((n) => n.label).join(' + ');
}

/**
 * Starts a chain-lesson session — the multi-day-arc counterpart to the
 * reactive diagnostic engine. Opens with a hard, whole-concept prediction
 * question, then the first chunk of a forward (teaching-order) walk
 * through the chain, at whatever granularity the student's accumulated
 * review history on this chain warrants.
 */
export async function startChainLesson(
  userId: string,
  conceptKey: string,
  subject: string,
  topic: string,
  concept: string
): Promise<ChainLessonResult> {
  const chainResult = await getOrGenerateChain(conceptKey, subject, topic, concept);
  if (!chainResult.chain) {
    throw new Error('Could not generate a dependency chain for this concept.');
  }
  const chain = chainResult.chain as Chain;

  const reviewCount = await getReviewCount(userId, conceptKey);
  const chunks = computeChunks(chain, reviewCount);

  const target = chain.nodes[chain.nodes.length - 1];
  const opening = await callJSON<{ question: string }>(
    PREDICTION_ERROR_QUESTION_PROMPT,
    `Subject: ${subject}\nConcept: ${target.label}`,
    MODELS.diagnosticTree,
    0.3
  );

  const state: ChainLessonState = {
    conceptKey,
    subject,
    chain,
    chunks,
    currentChunkIndex: -1,
    results: [],
    anyMisconceptionSoFar: false,
  };

  return { done: false, nextQuestion: opening.question, state };
}

async function generateChunkQuestion(subject: string, chunk: ChainNode[]): Promise<string> {
  const conceptList = chunk.map((n) => n.label).join(', then ');
  const result = await callJSON<{ question: string }>(
    FORWARD_CHUNK_QUESTION_PROMPT,
    `Subject: ${subject}\nConcept(s) in this chunk, in order: ${conceptList}`,
    MODELS.diagnosticTree,
    0.3
  );
  return result.question;
}

/**
 * Advances the session by one answer. The opening prediction-error
 * question is never corrected inline — its purpose is just to surface
 * whether a real gap exists before the scaffold walk begins; the scaffold
 * itself is the remediation. Every chunk after that gets an immediate,
 * lightweight correction if it reveals a misconception, before moving on
 * to the next chunk — never deferred to the end.
 */
export async function processChainLessonAnswer(
  userId: string,
  state: ChainLessonState,
  answer: string
): Promise<ChainLessonResult> {
  const target = state.chain.nodes[state.chain.nodes.length - 1];

  if (state.currentChunkIndex === -1) {
    // Just answered the opening prediction question — record it, but no
    // inline correction here; move straight into the scaffold.
    const check = await checkAnswer(target.label, '(opening prediction question)', answer);
    const nextState: ChainLessonState = {
      ...state,
      currentChunkIndex: 0,
      anyMisconceptionSoFar: state.anyMisconceptionSoFar || !check.correct,
    };
    const firstChunkQuestion = await generateChunkQuestion(state.subject, state.chunks[0]);
    return { done: false, nextQuestion: firstChunkQuestion, state: nextState };
  }

  // Answering a chunk within the scaffold walk.
  const chunk = state.chunks[state.currentChunkIndex];
  const label = chunkLabel(chunk);
  const check = await checkAnswer(label, '(forward reconstruction question)', answer);

  let inlineCorrection: string | undefined;
  if (!check.correct) {
    const contextLines = [`Concept: ${label}`, `Diagnosis: misconception`];
    if (check.misconceptionNote) contextLines.push(`Specific misconception observed: ${check.misconceptionNote}`);
    const correctionResult = await callJSON<{ correction: string }>(
      CORRECTION_PROMPT,
      contextLines.join('\n'),
      MODELS.diagnosticTree,
      0.3
    );
    inlineCorrection = correctionResult.correction;
  }

  const results = [...state.results, { chunkLabel: label, correct: check.correct, correction: inlineCorrection }];
  const nextIndex = state.currentChunkIndex + 1;
  const anyMisconceptionSoFar = state.anyMisconceptionSoFar || !check.correct;

  if (nextIndex >= state.chunks.length) {
    // Whole chain walk complete — grade the target concept and advance
    // this chain's own lesson progress, so the NEXT time it's due, the
    // chunking is coarser than this time.
    const reviewCount = await getReviewCount(userId, state.conceptKey);
    await incrementReviewCount(userId, state.conceptKey, reviewCount);
    await gradeAndRecordReview(userId, state.conceptKey, anyMisconceptionSoFar ? 'hard' : 'easy');

    return {
      done: true,
      summary: results,
      state: { ...state, currentChunkIndex: nextIndex, results, anyMisconceptionSoFar },
    };
  }

  const nextChunkQuestion = await generateChunkQuestion(state.subject, state.chunks[nextIndex]);
  return {
    done: false,
    nextQuestion: nextChunkQuestion,
    inlineCorrection,
    state: { ...state, currentChunkIndex: nextIndex, results, anyMisconceptionSoFar },
  };
}
