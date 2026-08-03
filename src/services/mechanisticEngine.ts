import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { gradeAndRecordReview, getMasteryStatus } from './reviewService';
import { runSharedEncodingCheck } from './sharedDiagnosticSteps';
import {
  WM_RELAXATION_PROMPT,
  LOCALIZATION_CHECK_PROMPT,
  CHECK_ANSWER_AND_SLIP_PROMPT,
  CUED_COMBINATION_PROMPT,
  CORRECTION_PROMPT,
} from '../constants/diagnosticPrompts';
import { processDiagnosticAnswer, DiagnosticState, DiagnosticResult, Diagnosis } from './diagnosticEngine';

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

export async function loadChainIfMechanistic(conceptKey: string): Promise<Chain | null> {
  const { data, error } = await supabaseAdmin
    .from('dependency_chains')
    .select('chain')
    .eq('concept_key', conceptKey)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const chain = data.chain as Chain;
  const target = chain.nodes[chain.nodes.length - 1];
  if (!target || target.depends_on.length === 0) return null; // effectively atomic
  return chain;
}

export type MechanisticStage = 'encoding_check' | 'wm_relax' | 'localizing' | 'sub_diagnostic' | 'combination_check';

export interface MechanisticState {
  conceptKey: string;
  targetConceptLabel: string;
  subject: string;
  originalQuestion: string;
  chain: Chain;
  stage: MechanisticStage;
  currentNodeId: string;
  recognitionCorrectAnswer?: string;
  subDiagnosticState?: DiagnosticState;
}

export interface MechanisticResult {
  done: boolean;
  diagnosis?: Diagnosis | 'transfer' | 'integration' | 'global_chain_failure';
  correction?: string;
  nextQuestion?: string;
  nextOptions?: string[];
  state: MechanisticState;
}

function findNode(chain: Chain, id: string): ChainNode | undefined {
  return chain.nodes.find((n) => n.id === id);
}

function chainDepth(chain: Chain, nodeId: string, seen = new Set<string>()): number {
  if (seen.has(nodeId)) return 0;
  seen.add(nodeId);
  const node = findNode(chain, nodeId);
  if (!node || node.depends_on.length === 0) return 1;
  return 1 + Math.max(...node.depends_on.map((e) => chainDepth(chain, e.node_id, seen)));
}

async function generateCorrection(conceptLabel: string, diagnosis: string): Promise<string> {
  const result = await callJSON<{ correction: string }>(
    CORRECTION_PROMPT,
    `Concept: ${conceptLabel}\nDiagnosis: ${diagnosis}`,
    MODELS.diagnosticTree,
    0.3
  );
  return result.correction;
}

async function findBrokenPrerequisite(
  userId: string,
  chain: Chain,
  nodeId: string
): Promise<{ node: ChainNode; question: string } | null> {
  const node = findNode(chain, nodeId);
  if (!node) return null;

  for (const edge of node.depends_on) {
    const prereq = findNode(chain, edge.node_id);
    if (!prereq) continue;

    const mastery = await getMasteryStatus(userId, prereq.id);
    if (mastery.isMastered) continue;

    const q = await callJSON<{ question: string }>(
      LOCALIZATION_CHECK_PROMPT,
      `Concept: ${prereq.label}`,
      MODELS.diagnosticTree,
      0.3
    );
    return { node: prereq, question: q.question };
  }
  return null;
}

async function runCombinationCheck(state: MechanisticState): Promise<MechanisticResult> {
  const target = findNode(state.chain, state.chain.nodes[state.chain.nodes.length - 1].id);
  const prereqNames = (target?.depends_on || []).map((e) => findNode(state.chain, e.node_id)?.label).filter(Boolean).join(', ');

  const cued = await callJSON<{ cuedQuestion: string }>(
    CUED_COMBINATION_PROMPT,
    `Original question: ${state.originalQuestion}\nPrerequisite concepts to cue: ${prereqNames}`,
    MODELS.diagnosticTree,
    0.3
  );

  return {
    done: false,
    nextQuestion: cued.cuedQuestion,
    state: { ...state, stage: 'combination_check' },
  };
}

/**
 * Entry point for a mechanistic (chain-backed) diagnostic session — called
 * once the target question has already failed the ordinary slip-check at
 * the single-concept layer. Runs the SAME shared encoding check as the
 * atomic path first (matching the agreed tree order — section 2 applies
 * before any atomic/mechanistic branching), and only proceeds to the
 * chain-specific tests once retrieval failure is actually confirmed.
 */
export async function startMechanisticDiagnosis(
  userId: string,
  conceptKey: string,
  targetConceptLabel: string,
  subject: string,
  originalQuestion: string,
  chain: Chain
): Promise<MechanisticResult> {
  const baseState: MechanisticState = {
    conceptKey,
    targetConceptLabel,
    subject,
    originalQuestion,
    chain,
    stage: 'encoding_check',
    currentNodeId: chain.nodes[chain.nodes.length - 1].id,
  };

  const outcome = await runSharedEncodingCheck(userId, conceptKey, targetConceptLabel);

  switch (outcome.result) {
    case 'schedule_miscalibrated':
      await gradeAndRecordReview(userId, conceptKey, 'again');
      return { done: true, diagnosis: 'schedule_miscalibrated', correction: await generateCorrection(targetConceptLabel, 'schedule_miscalibrated'), state: baseState };
    case 'decay_schedule_skipped':
      await gradeAndRecordReview(userId, conceptKey, 'hard');
      return { done: true, diagnosis: 'decay', correction: await generateCorrection(targetConceptLabel, 'decay'), state: baseState };
    case 'needs_recognition_test':
      return {
        done: false,
        nextQuestion: outcome.question,
        nextOptions: outcome.options,
        state: { ...baseState, recognitionCorrectAnswer: outcome.correctAnswer },
      };
    default:
      throw new Error(`Unexpected encoding-check outcome: ${outcome.result}`);
  }
}

async function beginWmRelax(state: MechanisticState): Promise<MechanisticResult> {
  const simplified = await callJSON<{ simplifiedQuestion: string }>(
    WM_RELAXATION_PROMPT,
    `Concept: ${state.targetConceptLabel}\nOriginal question: ${state.originalQuestion}`,
    MODELS.diagnosticTree,
    0.3
  );
  return {
    done: false,
    nextQuestion: simplified.simplifiedQuestion,
    state: { ...state, stage: 'wm_relax' },
  };
}

export async function processMechanisticAnswer(
  userId: string,
  state: MechanisticState,
  answer: string,
  dontKnow: boolean
): Promise<MechanisticResult> {
  switch (state.stage) {
    case 'encoding_check': {
      const isCorrect = answer.trim() === (state.recognitionCorrectAnswer || '').trim();
      if (!isCorrect) {
        await gradeAndRecordReview(userId, state.conceptKey, 'again');
        return { done: true, diagnosis: 'encoding', correction: await generateCorrection(state.targetConceptLabel, 'encoding'), state };
      }
      // Retrieval failure confirmed — now, and only now, proceed to the
      // mechanistic-specific tests, starting with 3B.1 (WM-relaxation).
      return beginWmRelax(state);
    }

    case 'wm_relax': {
      const check = await callJSON<{ correct: boolean }>(
        CHECK_ANSWER_AND_SLIP_PROMPT,
        `Concept: ${state.targetConceptLabel}\nQuestion: (simplified)\nStudent's answer: ${answer}`,
        MODELS.simpleQuestion
      );
      if (check.correct) {
        await gradeAndRecordReview(userId, state.conceptKey, 'hard');
        return { done: true, diagnosis: 'wm_overload', correction: await generateCorrection(state.targetConceptLabel, 'wm_overload'), state };
      }

      const broken = await findBrokenPrerequisite(userId, state.chain, state.currentNodeId);
      if (!broken) {
        return runCombinationCheck(state);
      }
      return {
        done: false,
        nextQuestion: broken.question,
        state: { ...state, stage: 'localizing', currentNodeId: broken.node.id },
      };
    }

    case 'localizing': {
      const check = await callJSON<{ correct: boolean }>(
        CHECK_ANSWER_AND_SLIP_PROMPT,
        `Concept: ${findNode(state.chain, state.currentNodeId)?.label}\nQuestion: (localization check)\nStudent's answer: ${answer}`,
        MODELS.simpleQuestion
      );

      if (check.correct) {
        const broken = await findBrokenPrerequisite(userId, state.chain, state.currentNodeId);
        if (!broken) return runCombinationCheck(state);
        return {
          done: false,
          nextQuestion: broken.question,
          state: { ...state, currentNodeId: broken.node.id },
        };
      }

      const subState: DiagnosticState = {
        conceptLabel: state.currentNodeId,
        subject: state.subject,
        stage: 'initial',
        originalQuestion: `(localization check on ${findNode(state.chain, state.currentNodeId)?.label})`,
      };
      const subResult = await processDiagnosticAnswer(userId, subState, answer, dontKnow);

      if (!subResult.done) {
        return {
          done: false,
          nextQuestion: subResult.nextQuestion,
          nextOptions: subResult.nextOptions,
          state: { ...state, stage: 'sub_diagnostic', subDiagnosticState: subResult.state },
        };
      }

      await gradeAndRecordReview(userId, state.conceptKey, 'again');
      return { done: true, diagnosis: subResult.diagnosis, correction: subResult.correction, state };
    }

    case 'sub_diagnostic': {
      if (!state.subDiagnosticState) throw new Error('Missing sub-diagnostic state');
      const subResult: DiagnosticResult = await processDiagnosticAnswer(userId, state.subDiagnosticState, answer, dontKnow);

      if (!subResult.done) {
        return {
          done: false,
          nextQuestion: subResult.nextQuestion,
          nextOptions: subResult.nextOptions,
          state: { ...state, subDiagnosticState: subResult.state },
        };
      }

      await gradeAndRecordReview(userId, state.conceptKey, 'again');
      return { done: true, diagnosis: subResult.diagnosis, correction: subResult.correction, state };
    }

    case 'combination_check': {
      const check = await callJSON<{ correct: boolean }>(
        CHECK_ANSWER_AND_SLIP_PROMPT,
        `Concept: ${state.targetConceptLabel}\nQuestion: (cued combination)\nStudent's answer: ${answer}`,
        MODELS.simpleQuestion
      );

      if (check.correct) {
        await gradeAndRecordReview(userId, state.conceptKey, 'hard');
        return { done: true, diagnosis: 'transfer', correction: await generateCorrection(state.targetConceptLabel, 'transfer'), state };
      }

      const depth = chainDepth(state.chain, state.chain.nodes[state.chain.nodes.length - 1].id);
      if (depth >= 4) {
        const mastery = await getMasteryStatus(userId, state.conceptKey);
        if (mastery.scheduleWasFollowed === false) {
          await gradeAndRecordReview(userId, state.conceptKey, 'hard');
          return { done: true, diagnosis: 'decay', correction: await generateCorrection(state.targetConceptLabel, 'decay'), state };
        }
        await gradeAndRecordReview(userId, state.conceptKey, 'again');
        return { done: true, diagnosis: 'global_chain_failure', correction: await generateCorrection(state.targetConceptLabel, 'global_chain_failure'), state };
      }

      await gradeAndRecordReview(userId, state.conceptKey, 'again');
      return { done: true, diagnosis: 'integration', correction: await generateCorrection(state.targetConceptLabel, 'integration'), state };
    }

    default:
      throw new Error(`Unknown mechanistic stage: ${state.stage}`);
  }
}
