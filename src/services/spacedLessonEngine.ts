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
 * target last) into progressively larger chunks as review_count grows,
 * for the SCAFFOLD walk specifically. Deliberately gradual: jumping
 * straight from "every step separate" to "the whole chain in one go"
 * would risk exactly the working-memory overload this progression exists
 * to avoid.
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

/**
 * A SEPARATE, later phase from the scaffold walk — after every node has
 * been tested individually, this checks whether the student can now hold
 * a FEW of them together at once. Splits the chain into a couple (two)
 * roughly-equal contiguous groups, distinct from (and coarser than) the
 * scaffold's own chunking, which was still testing pieces individually by
 * the time reviewCount is low. A chain with fewer than 2 nodes has
 * nothing meaningful to combine, so this phase is skipped for it.
 */
export function computeCompressionGroups(chain: Chain): ChainNode[][] {
  const orderedNodes = chain.nodes;
  const totalLinks = orderedNodes.length;
  if (totalLinks < 2) return [];

  const groupCount = 2;
  const groups: ChainNode[][] = [];
  const baseSize = Math.floor(totalLinks / groupCount);
  let remainder = totalLinks % groupCount;
  let idx = 0;
  for (let i = 0; i < groupCount; i++) {
    const size = baseSize + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    groups.push(orderedNodes.slice(idx, idx + size));
    idx += size;
  }
  return groups;
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

export type ChainLessonStage = 'scaffold' | 'compression';

export interface ChainLessonState {
  conceptKey: string;
  subject: string;
  chain: Chain;
  chunks: ChainNode[][];
  compressionGroups: ChainNode[][];
  stage: ChainLessonStage;
  currentChunkIndex: number; // -1 = showing the opening prediction-error question (scaffold stage only)
  results: ChunkResult[];
  anyMisconceptionSoFar: boolean;
}

export interface ChainLessonResult {
  done: boolean;
  nextQuestion?: string;
  inlineCorrection?: string; // addresses the answer just given, shown alongside the NEXT question
  summary?: ChunkResult[];
  state: ChainLessonState;
}

function groupLabel(group: ChainNode[]): string {
  return group.map((n) => n.label).join(' + ');
}

export async function startChainLesson(
  userId: string,
  conceptKey: string,
  subject: string,
  topic: string,
  concept: string,
  qualification = '',
  examBoard = ''
): Promise<ChainLessonResult> {
  const chainResult = await getOrGenerateChain(conceptKey, subject, topic, concept, qualification, examBoard);
  if (!chainResult.chain) {
    throw new Error('Could not generate a dependency chain for this concept.');
  }
  const chain = chainResult.chain as Chain;

  const reviewCount = await getReviewCount(userId, conceptKey);
  const chunks = computeChunks(chain, reviewCount);
  const compressionGroups = computeCompressionGroups(chain);

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
    compressionGroups,
    stage: 'scaffold',
    currentChunkIndex: -1,
    results: [],
    anyMisconceptionSoFar: false,
  };

  return { done: false, nextQuestion: opening.question, state };
}

async function generateGroupQuestion(subject: string, group: ChainNode[]): Promise<string> {
  const conceptList = group.map((n) => n.label).join(', then ');
  const result = await callJSON<{ question: string }>(
    FORWARD_CHUNK_QUESTION_PROMPT,
    `Subject: ${subject}\nConcept(s) in this chunk, in order: ${conceptList}`,
    MODELS.diagnosticTree,
    0.3
  );
  return result.question;
}

async function generateInlineCorrection(label: string, misconceptionNote: string | null): Promise<string> {
  const contextLines = [`Concept: ${label}`, `Diagnosis: misconception`];
  if (misconceptionNote) contextLines.push(`Specific misconception observed: ${misconceptionNote}`);
  const result = await callJSON<{ correction: string }>(CORRECTION_PROMPT, contextLines.join('\n'), MODELS.diagnosticTree, 0.3);
  return result.correction;
}

async function finishLesson(userId: string, state: ChainLessonState, results: ChunkResult[], anyMisconceptionSoFar: boolean): Promise<ChainLessonResult> {
  const reviewCount = await getReviewCount(userId, state.conceptKey);
  await incrementReviewCount(userId, state.conceptKey, reviewCount);
  await gradeAndRecordReview(userId, state.conceptKey, anyMisconceptionSoFar ? 'hard' : 'easy');

  return { done: true, summary: results, state: { ...state, results, anyMisconceptionSoFar } };
}

/**
 * Advances the session by one answer. The opening prediction-error
 * question is never corrected inline — the scaffold itself is the
 * remediation for whatever it reveals. Every question after that gets an
 * immediate, lightweight correction if it reveals a misconception, before
 * moving on — never deferred to the end. After the full scaffold walk
 * (every node tested individually), a SEPARATE compression phase follows:
 * a couple of coarser questions, each requiring the student to hold
 * several nodes together at once, before the session actually finishes.
 */
export async function processChainLessonAnswer(
  userId: string,
  state: ChainLessonState,
  answer: string
): Promise<ChainLessonResult> {
  const target = state.chain.nodes[state.chain.nodes.length - 1];

  if (state.stage === 'scaffold' && state.currentChunkIndex === -1) {
    // Just answered the opening prediction question — no inline
    // correction here; move straight into the scaffold.
    const check = await checkAnswer(target.label, '(opening prediction question)', answer);
    const nextState: ChainLessonState = {
      ...state,
      currentChunkIndex: 0,
      anyMisconceptionSoFar: state.anyMisconceptionSoFar || !check.correct,
    };
    const firstChunkQuestion = await generateGroupQuestion(state.subject, state.chunks[0]);
    return { done: false, nextQuestion: firstChunkQuestion, state: nextState };
  }

  if (state.stage === 'scaffold') {
    const chunk = state.chunks[state.currentChunkIndex];
    const label = groupLabel(chunk);
    const check = await checkAnswer(label, '(forward reconstruction question)', answer);

    const inlineCorrection = check.correct ? undefined : await generateInlineCorrection(label, check.misconceptionNote);
    const results = [...state.results, { chunkLabel: label, correct: check.correct, correction: inlineCorrection }];
    const nextIndex = state.currentChunkIndex + 1;
    const anyMisconceptionSoFar = state.anyMisconceptionSoFar || !check.correct;

    if (nextIndex >= state.chunks.length) {
      // Scaffold walk complete — move into the compression phase, if this
      // chain has enough nodes to make one meaningful (skip straight to
      // finishing otherwise).
      if (state.compressionGroups.length === 0) {
        return finishLesson(userId, { ...state, currentChunkIndex: nextIndex }, results, anyMisconceptionSoFar);
      }
      const firstGroupQuestion = await generateGroupQuestion(state.subject, state.compressionGroups[0]);
      return {
        done: false,
        nextQuestion: firstGroupQuestion,
        inlineCorrection,
        state: { ...state, stage: 'compression', currentChunkIndex: 0, results, anyMisconceptionSoFar },
      };
    }

    const nextChunkQuestion = await generateGroupQuestion(state.subject, state.chunks[nextIndex]);
    return {
      done: false,
      nextQuestion: nextChunkQuestion,
      inlineCorrection,
      state: { ...state, currentChunkIndex: nextIndex, results, anyMisconceptionSoFar },
    };
  }

  // stage === 'compression'
  const group = state.compressionGroups[state.currentChunkIndex];
  const label = groupLabel(group);
  const check = await checkAnswer(label, '(compression question — holding several steps together)', answer);

  const inlineCorrection = check.correct ? undefined : await generateInlineCorrection(label, check.misconceptionNote);
  const results = [...state.results, { chunkLabel: label, correct: check.correct, correction: inlineCorrection }];
  const nextIndex = state.currentChunkIndex + 1;
  const anyMisconceptionSoFar = state.anyMisconceptionSoFar || !check.correct;

  if (nextIndex >= state.compressionGroups.length) {
    return finishLesson(userId, { ...state, currentChunkIndex: nextIndex }, results, anyMisconceptionSoFar);
  }

  const nextGroupQuestion = await generateGroupQuestion(state.subject, state.compressionGroups[nextIndex]);
  return {
    done: false,
    nextQuestion: nextGroupQuestion,
    inlineCorrection,
    state: { ...state, currentChunkIndex: nextIndex, results, anyMisconceptionSoFar },
  };
}
