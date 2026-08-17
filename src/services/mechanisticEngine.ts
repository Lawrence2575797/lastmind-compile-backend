import { callClaudeJSON, MODELS } from './claudeClient';
import { gradeAndRecordReview, getMasteryStatus } from './reviewService';
import { runSharedEncodingCheck } from './sharedDiagnosticSteps';
import { getOrGenerateChain } from './chainService';
import { parseModelJson } from './jsonParsing';
import {
  LOCALIZATION_CHECK_PROMPT,
  CHECK_ANSWER_AND_SLIP_PROMPT,
  MATH_ANSWER_CHECK_AND_SLIP_PROMPT,
  CUED_COMBINATION_PROMPT,
  LOCALIZE_INTEGRATION_FAILURE_PROMPT,
  CORRECTION_PROMPT,
  REFRAME_QUESTION_PROMPT,
} from '../constants/diagnosticPrompts';
import { processDiagnosticAnswer, reframeCurrentQuestion as reframeCurrentAtomicQuestion, retryCurrentQuestion as retryCurrentAtomicQuestion, DiagnosticState, DiagnosticResult, Diagnosis } from './diagnosticEngine';

// Same fix, same reasoning as diagnosticEngine.ts's own callJSON — see its
// comment. This engine's LOCALIZATION_CHECK_PROMPT call in particular
// carries a whole chain's worth of context, easily enough to run past the
// 2048 default before producing any usable output.
async function callJSON<T>(systemPrompt: string, userContent: string, model: string, temperature = 0, maxTokens = 4096): Promise<T> {
  const raw = await callClaudeJSON({ model, systemPrompt, userContent, temperature, maxTokens });
  return parseModelJson<T>(raw);
}

interface AnswerCheck { correct: boolean; misconceptionNote: string | null; }

// Mirrors diagnosticEngine.ts's checkAnswer of the same name/purpose —
// expectedSolution present means the question just answered was a
// calculation, graded against verified ground truth via a stronger model.
async function checkAnswer(conceptLabel: string, questionDescription: string, answer: string, expectedSolution?: string): Promise<AnswerCheck> {
  if (expectedSolution) {
    return callJSON<AnswerCheck>(
      MATH_ANSWER_CHECK_AND_SLIP_PROMPT,
      `Question: ${questionDescription}\nVerified correct solution (reference only, never shown to the student): ${expectedSolution}\nStudent's working: ${answer}`,
      MODELS.diagnosticTree,
      0.1
    );
  }
  return callJSON<AnswerCheck>(
    CHECK_ANSWER_AND_SLIP_PROMPT,
    `Concept: ${conceptLabel}\nQuestion: ${questionDescription}\nStudent's answer: ${answer}`,
    MODELS.simpleQuestion
  );
}

interface ChainEdge { node_id: string; relationship: 'definitional' | 'reasoning'; }
interface ChainNode { id: string; label: string; depends_on: ChainEdge[]; }
interface Chain { concept_id: string; subject: string; nodes: ChainNode[]; }

export async function loadChainIfMechanistic(
  conceptKey: string,
  subject: string,
  topic: string,
  concept: string,
  qualification = '',
  examBoard = ''
): Promise<Chain | null> {
  const result = await getOrGenerateChain(conceptKey, subject, topic, concept, qualification, examBoard);
  if (!result.chain) return null;

  const chain = result.chain as Chain;
  const target = chain.nodes[chain.nodes.length - 1];
  if (!target || target.depends_on.length === 0) return null;
  return chain;
}

export type MechanisticStage = 'encoding_check' | 'localizing' | 'sub_diagnostic' | 'combination_check' | 'integration_check';

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
  // Same purpose as in DiagnosticState — accumulated so the eventual
  // correction addresses the actual specific error, not a generic template.
  misconceptionNotes: string[];
  confusedWith?: string;
  // Set when combination_check's cued re-ask is STILL wrong and
  // LOCALIZE_INTEGRATION_FAILURE_PROMPT finds real evidence pointing at
  // one specific cued prerequisite — the node currently being tested in
  // isolation during the 'integration_check' stage. Its label gets threaded
  // into the eventual correction (see generateCorrection's extraLabel
  // param) so a resolved integration diagnosis names the exact connection
  // that was missing, instead of a generic "practice combining these"
  // note — see CORRECTION_PROMPT's own "integration" bullet.
  integrationLocalizedNodeId?: string;
  // Same purpose as DiagnosticState.lastShownQuestion — see there.
  lastShownQuestion?: string;
  // Same purpose as DiagnosticState.lastShownOptions — see there.
  lastShownOptions?: string[];
  // Same purpose/split as DiagnosticState's fields of the same names —
  // originalQuestion* is set at entry (see startMechanisticDiagnosis) when
  // the question that triggered this diagnosis was itself a calculation,
  // and is what combination_check's cued re-ask still tests. lastGenerated*
  // covers whichever DIFFERENT question was most recently generated — a
  // localization check on a specific prerequisite, or the isolated
  // integration_check question (a genuinely different concept from the
  // target either way, so it can never reuse originalQuestion*'s own calc
  // info).
  originalQuestionRequiresCalculation?: boolean;
  originalQuestionExpectedSolution?: string;
  lastGeneratedRequiresCalculation?: boolean;
  lastGeneratedExpectedSolution?: string;
}

export interface MechanisticResult {
  done: boolean;
  diagnosis?: Diagnosis | 'transfer' | 'integration' | 'global_chain_failure';
  correction?: string;
  nextQuestion?: string;
  nextOptions?: string[];
  state: MechanisticState;
  // Same meaning as DiagnosticResult.answerCorrect — see there.
  answerCorrect?: boolean;
  // Same meaning as DiagnosticResult.nextRequiresCalculation — see there.
  nextRequiresCalculation?: boolean;
}

// Mirrors diagnosticEngine.ts's currentQuestionCalcInfo of the same
// purpose — which calc info describes whatever's CURRENTLY on screen,
// given the stage. 'localizing' and 'integration_check' are both grading
// a question this engine itself just generated (lastGenerated*); every
// other free-text stage ('encoding_check' at entry, 'combination_check')
// is testing originalQuestion itself, directly or cued.
function currentQuestionCalcInfo(state: MechanisticState): { requiresCalculation: boolean; expectedSolution?: string } {
  if (state.stage === 'localizing' || state.stage === 'integration_check') {
    return { requiresCalculation: !!state.lastGeneratedRequiresCalculation, expectedSolution: state.lastGeneratedExpectedSolution };
  }
  return { requiresCalculation: !!state.originalQuestionRequiresCalculation, expectedSolution: state.originalQuestionExpectedSolution };
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

function appendNote(state: MechanisticState, note: string | null | undefined): MechanisticState {
  if (!note) return state;
  return { ...state, misconceptionNotes: [...state.misconceptionNotes, note] };
}

// extraLabel — see integrationLocalizedNodeId's own comment: the specific
// prerequisite the student demonstrably CAN do in isolation but still
// isn't connecting to the target, when known. Only meaningful alongside
// diagnosis 'integration' (see CORRECTION_PROMPT's own handling of it),
// harmless to pass for anything else since it's just an extra context line.
async function generateCorrection(conceptLabel: string, diagnosis: string, state: MechanisticState, extraLabel?: string): Promise<string> {
  const contextLines = [`Concept: ${conceptLabel}`, `Diagnosis: ${diagnosis}`];
  if (state.misconceptionNotes.length) {
    contextLines.push(`Specific misconception observed: ${state.misconceptionNotes[state.misconceptionNotes.length - 1]}`);
  }
  if (state.confusedWith) {
    contextLines.push(`Specifically confused with: ${state.confusedWith}`);
  }
  if (extraLabel) {
    contextLines.push(`Demonstrably already knows this on its own, just isn't connecting it to the target: ${extraLabel}`);
  }
  const result = await callJSON<{ correction: string }>(CORRECTION_PROMPT, contextLines.join('\n'), MODELS.diagnosticTree, 0.3);
  return result.correction;
}

async function findBrokenPrerequisite(
  userId: string,
  subject: string,
  chain: Chain,
  nodeId: string
): Promise<{ node: ChainNode; question: string; requiresCalculation: boolean; expectedSolution?: string } | null> {
  const node = findNode(chain, nodeId);
  if (!node) return null;

  for (const edge of node.depends_on) {
    const prereq = findNode(chain, edge.node_id);
    if (!prereq) continue;

    const mastery = await getMasteryStatus(userId, prereq.id);
    if (mastery.isMastered) continue;

    const q = await callJSON<{ question: string; requiresCalculation?: boolean; expectedSolution?: string }>(
      LOCALIZATION_CHECK_PROMPT,
      `Subject: ${subject}\nConcept: ${prereq.label}`,
      MODELS.diagnosticTree,
      0.3
    );
    return {
      node: prereq,
      question: q.question,
      requiresCalculation: !!q.requiresCalculation,
      expectedSolution: q.requiresCalculation ? q.expectedSolution : undefined,
    };
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
    state: { ...state, stage: 'combination_check', lastShownQuestion: cued.cuedQuestion },
    // Re-asking originalQuestion (cued), not a fresh calculation of its
    // own — its calc status is whatever originalQuestion* already holds.
    nextRequiresCalculation: !!state.originalQuestionRequiresCalculation,
  };
}

// Runs the shared encoding check and routes into the mechanistic tree's
// first real stage. Factored out of startMechanisticDiagnosis specifically
// so the entry-level wording gate (see startMechanisticDiagnosis) can defer
// it by one round-trip without re-running anything, mirroring
// diagnosticEngine.ts's runEncodingCheckOrSkip / resumeWrongAnswerContinuation
// split for the exact same reason.
async function runEncodingCheckOrSkip(userId: string, state: MechanisticState): Promise<MechanisticResult> {
  const outcome = await runSharedEncodingCheck(userId, state.conceptKey, state.targetConceptLabel, state.subject);

  switch (outcome.result) {
    case 'schedule_miscalibrated':
      await gradeAndRecordReview(userId, state.conceptKey, 'again');
      return { done: true, diagnosis: 'schedule_miscalibrated', correction: await generateCorrection(state.targetConceptLabel, 'schedule_miscalibrated', state), state, answerCorrect: false };
    case 'decay_schedule_skipped':
      await gradeAndRecordReview(userId, state.conceptKey, 'hard');
      return { done: true, diagnosis: 'decay', correction: await generateCorrection(state.targetConceptLabel, 'decay', state), state, answerCorrect: false };
    case 'needs_recognition_test':
      return {
        done: false,
        nextQuestion: outcome.question,
        nextOptions: outcome.options,
        state: { ...state, recognitionCorrectAnswer: outcome.correctAnswer, lastShownQuestion: outcome.question, lastShownOptions: outcome.options },
        answerCorrect: false,
      };
    default:
      throw new Error(`Unexpected encoding-check outcome: ${outcome.result}`);
  }
}

export async function startMechanisticDiagnosis(
  userId: string,
  conceptKey: string,
  targetConceptLabel: string,
  subject: string,
  originalQuestion: string,
  chain: Chain,
  // Set only by the maths diagnosis entry (startMathDiagnosis) when the
  // original question was itself a calculation and the error was
  // classified conceptual — carried through so combination_check's cued
  // re-ask of this same question stays math-aware too.
  originalQuestionRequiresCalculation = false,
  originalQuestionExpectedSolution?: string
): Promise<MechanisticResult> {
  const baseState: MechanisticState = {
    conceptKey,
    targetConceptLabel,
    subject,
    originalQuestion,
    chain,
    stage: 'encoding_check',
    currentNodeId: chain.nodes[chain.nodes.length - 1].id,
    misconceptionNotes: [],
    originalQuestionRequiresCalculation,
    originalQuestionExpectedSolution: originalQuestionRequiresCalculation ? originalQuestionExpectedSolution : undefined,
  };

  return advanceAfterWrongAnswer(userId, baseState);
}

// Runs the moment encoding_check's recognition test passes on the TARGET
// concept — walks straight into the prerequisite-localization machinery
// (findBrokenPrerequisite -> localizing, or combination_check if every
// prerequisite already reads as mastered). No intermediate "cold retry
// on the target itself" stage (the old 'wm_relax'): a target with real
// prerequisites is exactly the multi-chunk case this engine exists for,
// and a simplified retry of the TARGET alone risked silently dropping
// whichever prerequisite was actually the problem (WM_RELAXATION_PROMPT
// had no awareness there even were separate pieces to preserve),
// concluding "wm_overload" and stopping before ever reaching the
// localization walk that would have found the real issue. That walk,
// now sharper with the integration_check disambiguation below, already
// IS the "reduce load, test genuinely separable pieces" strategy — done
// properly, on real sub-questions, rather than a same-target reword.
async function proceedToLocalization(userId: string, state: MechanisticState): Promise<MechanisticResult> {
  const broken = await findBrokenPrerequisite(userId, state.subject, state.chain, state.currentNodeId);
  if (!broken) {
    return { ...(await runCombinationCheck(state)), answerCorrect: true };
  }
  return {
    done: false,
    nextQuestion: broken.question,
    state: {
      ...state,
      stage: 'localizing',
      currentNodeId: broken.node.id,
      lastShownQuestion: broken.question,
      lastGeneratedRequiresCalculation: broken.requiresCalculation,
      lastGeneratedExpectedSolution: broken.expectedSolution,
    },
    answerCorrect: true, // the recognition check that led here just passed
    nextRequiresCalculation: broken.requiresCalculation,
  };
}

// Runs once a free-text answer has already been confirmed wrong, resuming
// exactly the escalation each stage would have run immediately — factored
// out so the wording gate can defer it by one round-trip without
// re-grading anything. Mirrors diagnosticEngine.ts's function of the same
// name/purpose.
async function resumeWrongAnswerContinuation(userId: string, state: MechanisticState): Promise<MechanisticResult> {
  switch (state.stage) {
    // Resuming from startMechanisticDiagnosis's entry call — runs the
    // shared encoding check immediately. Distinct from
    // processMechanisticAnswer's own case 'encoding_check', which grades a
    // real in-progress MCQ answer — this case only ever fires at entry,
    // before any MCQ has been shown.
    case 'encoding_check':
      return runEncodingCheckOrSkip(userId, state);

    case 'localizing': {
      // Found the actual break — hand off to the FULL single-concept
      // engine on this specific node, recursively. Dispatched the same
      // "don't know"-equivalent way dispatchToBranch/runEncodingCheckOrSkip
      // already do elsewhere in this codebase for "we already know this
      // needs deeper diagnosis" hand-offs, rather than re-passing the
      // original answer text — that text is gone by this point anyway,
      // since this turn's `answer` is whatever was submitted for the
      // localization check itself, not a fresh answer to re-grade. This
      // sub-diagnostic starts genuinely fresh (its own originalQuestion is
      // just a placeholder label, not the localization question itself —
      // see DiagnosticState.originalQuestionIsPlaceholder) — it decides
      // calc-vs-theory for the PREREQUISITE from scratch via its own
      // encoding_check -> hint_cue question generation, so nothing from
      // this localization stage needs seeding into it.
      const nodeLabel = findNode(state.chain, state.currentNodeId)?.label || state.currentNodeId;
      const subState: DiagnosticState = {
        conceptLabel: state.currentNodeId,
        subject: state.subject,
        stage: 'initial',
        originalQuestion: `(localization check on ${nodeLabel})`,
        // Marks originalQuestion above as a bookkeeping label, never meant
        // to be shown — see DiagnosticState.originalQuestionIsPlaceholder's
        // own comment for what this protects against (diagnosticEngine.ts's
        // encoding_check->hint_cue transition checks this before touching
        // originalQuestion).
        originalQuestionIsPlaceholder: true,
        misconceptionNotes: [],
      };
      const subResult = await processDiagnosticAnswer(userId, subState, '', true);

      if (!subResult.done) {
        return {
          done: false,
          nextQuestion: subResult.nextQuestion,
          nextOptions: subResult.nextOptions,
          state: { ...state, stage: 'sub_diagnostic', subDiagnosticState: subResult.state },
          answerCorrect: false,
          nextRequiresCalculation: subResult.nextRequiresCalculation,
        };
      }

      await gradeAndRecordReview(userId, state.conceptKey, 'again');
      return { done: true, diagnosis: subResult.diagnosis, correction: subResult.correction, state, answerCorrect: false };
    }

    case 'combination_check': {
      const depth = chainDepth(state.chain, state.chain.nodes[state.chain.nodes.length - 1].id);
      if (depth >= 4) {
        const mastery = await getMasteryStatus(userId, state.conceptKey);
        if (mastery.scheduleWasFollowed === false) {
          await gradeAndRecordReview(userId, state.conceptKey, 'hard');
          return { done: true, diagnosis: 'decay', correction: await generateCorrection(state.targetConceptLabel, 'decay', state), state, answerCorrect: false };
        }
        await gradeAndRecordReview(userId, state.conceptKey, 'again');
        return { done: true, diagnosis: 'global_chain_failure', correction: await generateCorrection(state.targetConceptLabel, 'global_chain_failure', state), state, answerCorrect: false };
      }

      // Even naming which prerequisites to combine wasn't enough — before
      // concluding a blanket "integration failure", check whether the
      // wrong answer's own content (captured as the latest misconception
      // note by checkAnswer, just before this) gives real evidence that
      // ONE specific cued prerequisite is actually the culprit. This is
      // worth checking even though findBrokenPrerequisite already tried
      // earlier in this same flow — that pass only ever trusted stored
      // FSRS mastery status, never the actual content of what the student
      // just wrote (see LOCALIZE_INTEGRATION_FAILURE_PROMPT's own comment).
      const target = findNode(state.chain, state.chain.nodes[state.chain.nodes.length - 1].id);
      const prereqNodes = (target?.depends_on || [])
        .map((e) => findNode(state.chain, e.node_id))
        .filter((n): n is ChainNode => !!n);
      const latestNote = state.misconceptionNotes[state.misconceptionNotes.length - 1];

      if (prereqNodes.length && latestNote) {
        const localized = await callJSON<{ localizedNodeId: string | null }>(
          LOCALIZE_INTEGRATION_FAILURE_PROMPT,
          [
            `Target concept: ${state.targetConceptLabel}`,
            `Cued prerequisites: ${JSON.stringify(prereqNodes.map((n) => ({ id: n.id, label: n.label })))}`,
            `Question (with cue): ${state.lastShownQuestion || state.originalQuestion}`,
            `What the wrong answer specifically revealed: ${latestNote}`,
          ].join('\n'),
          MODELS.diagnosticTree,
          0.2
        );
        const localizedNode = localized.localizedNodeId ? prereqNodes.find((n) => n.id === localized.localizedNodeId) : undefined;

        if (localizedNode) {
          // Same "ask a fresh, standalone question about this exact node"
          // tool findBrokenPrerequisite already uses — reused here for
          // consistency, just triggered by content-based evidence instead
          // of an FSRS mastery lookup.
          const isolated = await callJSON<{ question: string; requiresCalculation?: boolean; expectedSolution?: string }>(
            LOCALIZATION_CHECK_PROMPT,
            `Subject: ${state.subject}\nConcept: ${localizedNode.label}`,
            MODELS.diagnosticTree,
            0.3
          );
          return {
            done: false,
            nextQuestion: isolated.question,
            state: {
              ...state,
              stage: 'integration_check',
              integrationLocalizedNodeId: localizedNode.id,
              lastShownQuestion: isolated.question,
              lastGeneratedRequiresCalculation: !!isolated.requiresCalculation,
              lastGeneratedExpectedSolution: isolated.requiresCalculation ? isolated.expectedSolution : undefined,
            },
            answerCorrect: false,
            nextRequiresCalculation: !!isolated.requiresCalculation,
          };
        }
      }

      await gradeAndRecordReview(userId, state.conceptKey, 'again');
      return { done: true, diagnosis: 'integration', correction: await generateCorrection(state.targetConceptLabel, 'integration', state), state, answerCorrect: false };
    }

    default:
      throw new Error(`Cannot resume a wrong-answer continuation from stage: ${state.stage}`);
  }
}

// On-demand reword of whatever question is currently shown at the
// mechanistic level — mirrors diagnosticEngine.ts's function of the same
// name/purpose (see there for the full rationale). Delegates entirely to
// the atomic engine's own version when a sub_diagnostic is in progress,
// since that's a fully independent nested DiagnosticState with its own
// lastShownQuestion/originalQuestion bookkeeping.
export async function reframeCurrentQuestion(state: MechanisticState): Promise<MechanisticResult> {
  if (state.stage === 'sub_diagnostic') {
    if (!state.subDiagnosticState) throw new Error('Missing sub-diagnostic state');
    const subResult = await reframeCurrentAtomicQuestion(state.subDiagnosticState);
    return {
      done: subResult.done,
      diagnosis: subResult.diagnosis,
      correction: subResult.correction,
      nextQuestion: subResult.nextQuestion,
      nextOptions: subResult.nextOptions,
      state: { ...state, subDiagnosticState: subResult.state },
      nextRequiresCalculation: subResult.nextRequiresCalculation,
    };
  }

  const questionToReframe = state.lastShownQuestion || state.originalQuestion;
  const reframed = await callJSON<{ question: string }>(
    REFRAME_QUESTION_PROMPT,
    `Concept: ${state.targetConceptLabel}\nOriginal question: ${questionToReframe}`,
    MODELS.simpleQuestion,
    0.3
  );
  // Unlike the atomic engine's 'initial'/'slip_recheck' stages, no
  // mechanistic free-text stage passes originalQuestion's own TEXT to the
  // answer checker (they all use fixed labels — '(simplified)', '(cued
  // combination)', etc.) — so only lastShownQuestion needs updating here,
  // never originalQuestion itself.
  return {
    done: false,
    nextQuestion: reframed.question,
    state: { ...state, lastShownQuestion: reframed.question },
    nextRequiresCalculation: currentQuestionCalcInfo(state).requiresCalculation,
  };
}

// Re-serves the current question unchanged for a genuine retry — mirrors
// diagnosticEngine.ts's function of the same name/purpose (see there for
// why "report as a slip" now retries instead of trusting the self-report
// outright). Delegates to the atomic engine's own version when a nested
// sub-diagnostic is live, same delegation shape as reframeCurrentQuestion
// above.
export function retryCurrentQuestion(state: MechanisticState): MechanisticResult {
  if (state.stage === 'sub_diagnostic') {
    if (!state.subDiagnosticState) throw new Error('Missing sub-diagnostic state');
    const subResult = retryCurrentAtomicQuestion(state.subDiagnosticState);
    return {
      done: subResult.done,
      diagnosis: subResult.diagnosis,
      correction: subResult.correction,
      nextQuestion: subResult.nextQuestion,
      nextOptions: subResult.nextOptions,
      state: { ...state, subDiagnosticState: subResult.state },
      nextRequiresCalculation: subResult.nextRequiresCalculation,
    };
  }

  const questionToRetry = state.lastShownQuestion || state.originalQuestion;
  return {
    done: false,
    nextQuestion: questionToRetry,
    nextOptions: state.stage === 'encoding_check' ? state.lastShownOptions : undefined,
    state,
    nextRequiresCalculation: currentQuestionCalcInfo(state).requiresCalculation,
  };
}

// Advances straight into the next diagnostic escalation after a wrong
// answer. Mirrors diagnosticEngine.ts's function of the same name/purpose
// — see there for why this replaced the old mandatory wording gate.
function advanceAfterWrongAnswer(userId: string, state: MechanisticState): Promise<MechanisticResult> {
  return resumeWrongAnswerContinuation(userId, state);
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
        return { done: true, diagnosis: 'encoding', correction: await generateCorrection(state.targetConceptLabel, 'encoding', state), state, answerCorrect: false };
      }
      return proceedToLocalization(userId, state);
    }

    case 'localizing': {
      const nodeLabel = findNode(state.chain, state.currentNodeId)?.label || state.currentNodeId;
      const check = await checkAnswer(
        nodeLabel,
        '(localization check)',
        answer,
        state.lastGeneratedRequiresCalculation ? state.lastGeneratedExpectedSolution : undefined
      );
      const notedState = appendNote(state, check.misconceptionNote);

      if (check.correct) {
        const broken = await findBrokenPrerequisite(userId, notedState.subject, notedState.chain, notedState.currentNodeId);
        if (!broken) return { ...(await runCombinationCheck(notedState)), answerCorrect: true };
        return {
          done: false,
          nextQuestion: broken.question,
          state: {
            ...notedState,
            currentNodeId: broken.node.id,
            lastShownQuestion: broken.question,
            lastGeneratedRequiresCalculation: broken.requiresCalculation,
            lastGeneratedExpectedSolution: broken.expectedSolution,
          },
          answerCorrect: true,
          nextRequiresCalculation: broken.requiresCalculation,
        };
      }

      return advanceAfterWrongAnswer(userId, notedState);
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
          answerCorrect: subResult.answerCorrect,
          nextRequiresCalculation: subResult.nextRequiresCalculation,
        };
      }

      await gradeAndRecordReview(userId, state.conceptKey, 'again');
      return { done: true, diagnosis: subResult.diagnosis, correction: subResult.correction, state, answerCorrect: subResult.answerCorrect };
    }

    case 'combination_check': {
      const check = await checkAnswer(
        state.targetConceptLabel,
        '(cued combination)',
        answer,
        state.originalQuestionRequiresCalculation ? state.originalQuestionExpectedSolution : undefined
      );
      const notedState = appendNote(state, check.misconceptionNote);

      if (check.correct) {
        await gradeAndRecordReview(userId, notedState.conceptKey, 'hard');
        return { done: true, diagnosis: 'transfer', correction: await generateCorrection(notedState.targetConceptLabel, 'transfer', notedState), state: notedState, answerCorrect: true };
      }

      return advanceAfterWrongAnswer(userId, notedState);
    }

    // Grades the isolated, no-context test of whichever single prerequisite
    // LOCALIZE_INTEGRATION_FAILURE_PROMPT identified (see the
    // 'combination_check' case above) — the answer here splits what would
    // otherwise be a blanket "integration failure" into two genuinely
    // different outcomes.
    case 'integration_check': {
      const localizedNode = findNode(state.chain, state.integrationLocalizedNodeId || '');
      const check = await checkAnswer(
        localizedNode?.label || state.targetConceptLabel,
        '(isolated check)',
        answer,
        state.lastGeneratedRequiresCalculation ? state.lastGeneratedExpectedSolution : undefined
      );
      const notedState = appendNote(state, check.misconceptionNote);

      // The combined derivation still failed overall regardless of which
      // branch below this resolves to — the target's own FSRS record
      // reflects that either way.
      await gradeAndRecordReview(userId, state.conceptKey, 'again');

      if (!check.correct) {
        // Can't do it even on its own, with no surrounding context — a
        // real encoding gap on this SPECIFIC prerequisite, not a
        // combination problem. Grades that node's own FSRS record too,
        // distinctly from the target's — same split
        // sub_diagnostic/finish() already does for a nested atomic
        // diagnosis, just without the full nested tree since one direct
        // isolated question is enough to tell these two cases apart.
        if (localizedNode) await gradeAndRecordReview(userId, localizedNode.id, 'again');
        return {
          done: true,
          diagnosis: 'encoding',
          correction: await generateCorrection(localizedNode?.label || state.targetConceptLabel, 'encoding', notedState),
          state: notedState,
          answerCorrect: false,
        };
      }

      // Genuinely can do it standalone — this IS integration failure, but
      // now a scoped one: the correction can name exactly which
      // already-known piece isn't connecting, instead of a generic
      // "practice combining these" note (see generateCorrection's
      // extraLabel param and CORRECTION_PROMPT's own "integration" bullet).
      if (localizedNode) await gradeAndRecordReview(userId, localizedNode.id, 'good');
      return {
        done: true,
        diagnosis: 'integration',
        correction: await generateCorrection(state.targetConceptLabel, 'integration', notedState, localizedNode?.label),
        state: notedState,
        answerCorrect: true,
      };
    }

    default:
      throw new Error(`Unknown mechanistic stage: ${state.stage}`);
  }
}
