"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadChainIfMechanistic = loadChainIfMechanistic;
exports.startMechanisticDiagnosis = startMechanisticDiagnosis;
exports.processMechanisticAnswer = processMechanisticAnswer;
const claudeClient_1 = require("./claudeClient");
const reviewService_1 = require("./reviewService");
const sharedDiagnosticSteps_1 = require("./sharedDiagnosticSteps");
const chainService_1 = require("./chainService");
const jsonParsing_1 = require("./jsonParsing");
const diagnosticPrompts_1 = require("../constants/diagnosticPrompts");
const diagnosticEngine_1 = require("./diagnosticEngine");
const WORDING_CHECK_PROMPT_TEXT = 'Did you understand what this question was asking?';
async function callJSON(systemPrompt, userContent, model, temperature = 0) {
    const raw = await (0, claudeClient_1.callClaudeJSON)({ model, systemPrompt, userContent, temperature });
    return (0, jsonParsing_1.parseModelJson)(raw);
}
// Mirrors diagnosticEngine.ts's checkAnswer of the same name/purpose —
// expectedSolution present means the question just answered was a
// calculation, graded against verified ground truth via a stronger model.
async function checkAnswer(conceptLabel, questionDescription, answer, expectedSolution) {
    if (expectedSolution) {
        return callJSON(diagnosticPrompts_1.MATH_ANSWER_CHECK_AND_SLIP_PROMPT, `Question: ${questionDescription}\nVerified correct solution (reference only, never shown to the student): ${expectedSolution}\nStudent's working: ${answer}`, claudeClient_1.MODELS.diagnosticTree, 0.1);
    }
    return callJSON(diagnosticPrompts_1.CHECK_ANSWER_AND_SLIP_PROMPT, `Concept: ${conceptLabel}\nQuestion: ${questionDescription}\nStudent's answer: ${answer}`, claudeClient_1.MODELS.simpleQuestion);
}
async function loadChainIfMechanistic(conceptKey, subject, topic, concept) {
    const result = await (0, chainService_1.getOrGenerateChain)(conceptKey, subject, topic, concept);
    if (!result.chain)
        return null;
    const chain = result.chain;
    const target = chain.nodes[chain.nodes.length - 1];
    if (!target || target.depends_on.length === 0)
        return null;
    return chain;
}
// Mirrors diagnosticEngine.ts's currentQuestionCalcInfo of the same
// purpose — which calc info describes whatever's CURRENTLY on screen,
// given the stage. 'wm_relax' and 'localizing' are grading a question
// this engine itself just generated (lastGenerated*); every other
// free-text stage ('encoding_check' at entry, 'combination_check') is
// testing originalQuestion itself, directly or cued.
function currentQuestionCalcInfo(state) {
    if (state.stage === 'wm_relax' || state.stage === 'localizing') {
        return { requiresCalculation: !!state.lastGeneratedRequiresCalculation, expectedSolution: state.lastGeneratedExpectedSolution };
    }
    return { requiresCalculation: !!state.originalQuestionRequiresCalculation, expectedSolution: state.originalQuestionExpectedSolution };
}
function findNode(chain, id) {
    return chain.nodes.find((n) => n.id === id);
}
function chainDepth(chain, nodeId, seen = new Set()) {
    if (seen.has(nodeId))
        return 0;
    seen.add(nodeId);
    const node = findNode(chain, nodeId);
    if (!node || node.depends_on.length === 0)
        return 1;
    return 1 + Math.max(...node.depends_on.map((e) => chainDepth(chain, e.node_id, seen)));
}
function appendNote(state, note) {
    if (!note)
        return state;
    return { ...state, misconceptionNotes: [...state.misconceptionNotes, note] };
}
async function generateCorrection(conceptLabel, diagnosis, state) {
    const contextLines = [`Concept: ${conceptLabel}`, `Diagnosis: ${diagnosis}`];
    if (state.misconceptionNotes.length) {
        contextLines.push(`Specific misconception observed: ${state.misconceptionNotes[state.misconceptionNotes.length - 1]}`);
    }
    if (state.confusedWith) {
        contextLines.push(`Specifically confused with: ${state.confusedWith}`);
    }
    const result = await callJSON(diagnosticPrompts_1.CORRECTION_PROMPT, contextLines.join('\n'), claudeClient_1.MODELS.diagnosticTree, 0.3);
    return result.correction;
}
async function findBrokenPrerequisite(userId, subject, chain, nodeId) {
    const node = findNode(chain, nodeId);
    if (!node)
        return null;
    for (const edge of node.depends_on) {
        const prereq = findNode(chain, edge.node_id);
        if (!prereq)
            continue;
        const mastery = await (0, reviewService_1.getMasteryStatus)(userId, prereq.id);
        if (mastery.isMastered)
            continue;
        const q = await callJSON(diagnosticPrompts_1.LOCALIZATION_CHECK_PROMPT, `Subject: ${subject}\nConcept: ${prereq.label}`, claudeClient_1.MODELS.diagnosticTree, 0.3);
        return {
            node: prereq,
            question: q.question,
            requiresCalculation: !!q.requiresCalculation,
            expectedSolution: q.requiresCalculation ? q.expectedSolution : undefined,
        };
    }
    return null;
}
async function runCombinationCheck(state) {
    const target = findNode(state.chain, state.chain.nodes[state.chain.nodes.length - 1].id);
    const prereqNames = (target?.depends_on || []).map((e) => findNode(state.chain, e.node_id)?.label).filter(Boolean).join(', ');
    const cued = await callJSON(diagnosticPrompts_1.CUED_COMBINATION_PROMPT, `Original question: ${state.originalQuestion}\nPrerequisite concepts to cue: ${prereqNames}`, claudeClient_1.MODELS.diagnosticTree, 0.3);
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
async function runEncodingCheckOrSkip(userId, state) {
    const outcome = await (0, sharedDiagnosticSteps_1.runSharedEncodingCheck)(userId, state.conceptKey, state.targetConceptLabel);
    switch (outcome.result) {
        case 'schedule_miscalibrated':
            await (0, reviewService_1.gradeAndRecordReview)(userId, state.conceptKey, 'again');
            return { done: true, diagnosis: 'schedule_miscalibrated', correction: await generateCorrection(state.targetConceptLabel, 'schedule_miscalibrated', state), state, answerCorrect: false };
        case 'decay_schedule_skipped':
            await (0, reviewService_1.gradeAndRecordReview)(userId, state.conceptKey, 'hard');
            return { done: true, diagnosis: 'decay', correction: await generateCorrection(state.targetConceptLabel, 'decay', state), state, answerCorrect: false };
        case 'needs_recognition_test':
            return {
                done: false,
                nextQuestion: outcome.question,
                nextOptions: outcome.options,
                state: { ...state, recognitionCorrectAnswer: outcome.correctAnswer },
                answerCorrect: false,
            };
        default:
            throw new Error(`Unexpected encoding-check outcome: ${outcome.result}`);
    }
}
async function startMechanisticDiagnosis(userId, conceptKey, targetConceptLabel, subject, originalQuestion, chain, 
// Set only by the maths diagnosis entry (startMathDiagnosis) when the
// original question was itself a calculation and the error was
// classified conceptual — carried through so combination_check's cued
// re-ask of this same question stays math-aware too.
originalQuestionRequiresCalculation = false, originalQuestionExpectedSolution) {
    const baseState = {
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
    // Every path into this function follows a wrong (or "don't know") answer
    // to a REAL question the student was just shown (this function's only
    // caller, dispatchToBranch, always carries a genuine originalQuestion —
    // never a placeholder) — gate on wording before diagnosing anything, same
    // as every other free-text wrong answer in this tree. Was previously
    // skipped entirely at entry, so a misread question went straight into
    // full diagnosis instead of the "did you understand what was asked?"
    // check every later stage already gets.
    return gateOnWrongAnswer(baseState, originalQuestion);
}
async function beginWmRelax(state) {
    const simplified = await callJSON(diagnosticPrompts_1.WM_RELAXATION_PROMPT, `Subject: ${state.subject}\nConcept: ${state.targetConceptLabel}\nOriginal question: ${state.originalQuestion}`, claudeClient_1.MODELS.diagnosticTree, 0.3);
    return {
        done: false,
        nextQuestion: simplified.simplifiedQuestion,
        state: {
            ...state,
            stage: 'wm_relax',
            wmRelaxTrustworthy: simplified.staysGenuineRetrieval,
            lastShownQuestion: simplified.simplifiedQuestion,
            lastGeneratedRequiresCalculation: !!simplified.requiresCalculation,
            lastGeneratedExpectedSolution: simplified.requiresCalculation ? simplified.expectedSolution : undefined,
        },
        answerCorrect: true, // the recognition check that led here just passed
        nextRequiresCalculation: !!simplified.requiresCalculation,
    };
}
// Runs once a free-text answer has already been confirmed wrong, resuming
// exactly the escalation each stage would have run immediately — factored
// out so the wording gate can defer it by one round-trip without
// re-grading anything. Mirrors diagnosticEngine.ts's function of the same
// name/purpose.
async function resumeWrongAnswerContinuation(userId, state) {
    switch (state.stage) {
        // Resuming the entry-level gate set by startMechanisticDiagnosis —
        // runs exactly what would have run immediately had the gate not
        // existed. Distinct from processMechanisticAnswer's own
        // case 'encoding_check', which grades a real in-progress MCQ answer
        // and never gates (see gateOnWrongAnswer's comment) — this case only
        // ever fires via the entry-level gate, before any MCQ has been shown.
        case 'encoding_check':
            return runEncodingCheckOrSkip(userId, state);
        case 'wm_relax': {
            const broken = await findBrokenPrerequisite(userId, state.subject, state.chain, state.currentNodeId);
            if (!broken) {
                return { ...(await runCombinationCheck(state)), answerCorrect: false };
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
                answerCorrect: false,
                nextRequiresCalculation: broken.requiresCalculation,
            };
        }
        case 'localizing': {
            // Found the actual break — hand off to the FULL single-concept
            // engine on this specific node, recursively. Dispatched the same
            // "don't know"-equivalent way dispatchToBranch/runEncodingCheckOrSkip
            // already do elsewhere in this codebase for "we already know this
            // needs deeper diagnosis" hand-offs, rather than re-passing the
            // original answer text — by the time we're here (past the wording
            // gate), that text is gone anyway, since this turn's `answer` was the
            // gate's own yes/no response, not a fresh answer to re-grade. This
            // sub-diagnostic starts genuinely fresh (its own originalQuestion is
            // just a placeholder label, not the localization question itself —
            // see diagnosticEngine.ts's export comment on gateOnWrongAnswer) —
            // it decides calc-vs-theory for the PREREQUISITE from scratch via
            // its own encoding_check -> wm_relax generation, so nothing from
            // this localization stage needs seeding into it.
            const nodeLabel = findNode(state.chain, state.currentNodeId)?.label || state.currentNodeId;
            const subState = {
                conceptLabel: state.currentNodeId,
                subject: state.subject,
                stage: 'initial',
                originalQuestion: `(localization check on ${nodeLabel})`,
                misconceptionNotes: [],
            };
            const subResult = await (0, diagnosticEngine_1.processDiagnosticAnswer)(userId, subState, '', true);
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
            await (0, reviewService_1.gradeAndRecordReview)(userId, state.conceptKey, 'again');
            return { done: true, diagnosis: subResult.diagnosis, correction: subResult.correction, state, answerCorrect: false };
        }
        case 'combination_check': {
            const depth = chainDepth(state.chain, state.chain.nodes[state.chain.nodes.length - 1].id);
            if (depth >= 4) {
                const mastery = await (0, reviewService_1.getMasteryStatus)(userId, state.conceptKey);
                if (mastery.scheduleWasFollowed === false) {
                    await (0, reviewService_1.gradeAndRecordReview)(userId, state.conceptKey, 'hard');
                    return { done: true, diagnosis: 'decay', correction: await generateCorrection(state.targetConceptLabel, 'decay', state), state, answerCorrect: false };
                }
                await (0, reviewService_1.gradeAndRecordReview)(userId, state.conceptKey, 'again');
                return { done: true, diagnosis: 'global_chain_failure', correction: await generateCorrection(state.targetConceptLabel, 'global_chain_failure', state), state, answerCorrect: false };
            }
            await (0, reviewService_1.gradeAndRecordReview)(userId, state.conceptKey, 'again');
            return { done: true, diagnosis: 'integration', correction: await generateCorrection(state.targetConceptLabel, 'integration', state), state, answerCorrect: false };
        }
        default:
            throw new Error(`Cannot resume a wrong-answer continuation from stage: ${state.stage}`);
    }
}
// Handles the student's response to the "did you understand the wording?"
// gate. Mirrors diagnosticEngine.ts's function of the same name/purpose.
async function handleWordingGateResponse(userId, state, answer) {
    const gate = state.wordingGate;
    const understood = /^\s*yes/i.test(answer);
    const clearedState = { ...state, wordingGate: undefined };
    if (!understood) {
        const reframed = await callJSON(diagnosticPrompts_1.REFRAME_QUESTION_PROMPT, `Concept: ${state.targetConceptLabel}\nOriginal question: ${gate.failedQuestion}`, claudeClient_1.MODELS.simpleQuestion, 0.3);
        // Only the wording changes — whatever's being tested (and its
        // calculation status) doesn't, so currentQuestionCalcInfo still
        // correctly describes the reworded question too.
        return {
            done: false,
            nextQuestion: reframed.question,
            state: { ...clearedState, lastShownQuestion: reframed.question },
            nextRequiresCalculation: currentQuestionCalcInfo(clearedState).requiresCalculation,
        };
    }
    return resumeWrongAnswerContinuation(userId, clearedState);
}
// Wraps a "this free-text answer was wrong" result with the wording gate
// instead of escalating immediately. Mirrors diagnosticEngine.ts's function
// of the same name/purpose. Skipped for encoding_check (a 4-option MCQ)
// and sub_diagnostic (delegates entirely to the atomic engine, which
// already has its own gate).
function gateOnWrongAnswer(state, failedQuestion) {
    return {
        done: false,
        nextQuestion: WORDING_CHECK_PROMPT_TEXT,
        nextOptions: ['Yes', 'No'],
        state: { ...state, wordingGate: { failedQuestion } },
        answerCorrect: false,
    };
}
async function processMechanisticAnswer(userId, state, answer, dontKnow) {
    if (state.wordingGate) {
        return handleWordingGateResponse(userId, state, answer);
    }
    switch (state.stage) {
        case 'encoding_check': {
            const isCorrect = answer.trim() === (state.recognitionCorrectAnswer || '').trim();
            if (!isCorrect) {
                await (0, reviewService_1.gradeAndRecordReview)(userId, state.conceptKey, 'again');
                return { done: true, diagnosis: 'encoding', correction: await generateCorrection(state.targetConceptLabel, 'encoding', state), state, answerCorrect: false };
            }
            return beginWmRelax(state);
        }
        case 'wm_relax': {
            const check = await checkAnswer(state.targetConceptLabel, '(simplified)', answer, state.lastGeneratedRequiresCalculation ? state.lastGeneratedExpectedSolution : undefined);
            const notedState = appendNote(state, check.misconceptionNote);
            if (check.correct && state.wmRelaxTrustworthy !== false) {
                await (0, reviewService_1.gradeAndRecordReview)(userId, state.conceptKey, 'hard');
                return { done: true, diagnosis: 'wm_overload', correction: await generateCorrection(state.targetConceptLabel, 'wm_overload', notedState), state: notedState, answerCorrect: true };
            }
            return gateOnWrongAnswer(notedState, state.lastShownQuestion || state.originalQuestion);
        }
        case 'localizing': {
            const nodeLabel = findNode(state.chain, state.currentNodeId)?.label || state.currentNodeId;
            const check = await checkAnswer(nodeLabel, '(localization check)', answer, state.lastGeneratedRequiresCalculation ? state.lastGeneratedExpectedSolution : undefined);
            const notedState = appendNote(state, check.misconceptionNote);
            if (check.correct) {
                const broken = await findBrokenPrerequisite(userId, notedState.subject, notedState.chain, notedState.currentNodeId);
                if (!broken)
                    return { ...(await runCombinationCheck(notedState)), answerCorrect: true };
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
            return gateOnWrongAnswer(notedState, notedState.lastShownQuestion || `(localization check on ${nodeLabel})`);
        }
        case 'sub_diagnostic': {
            if (!state.subDiagnosticState)
                throw new Error('Missing sub-diagnostic state');
            const subResult = await (0, diagnosticEngine_1.processDiagnosticAnswer)(userId, state.subDiagnosticState, answer, dontKnow);
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
            await (0, reviewService_1.gradeAndRecordReview)(userId, state.conceptKey, 'again');
            return { done: true, diagnosis: subResult.diagnosis, correction: subResult.correction, state, answerCorrect: subResult.answerCorrect };
        }
        case 'combination_check': {
            const check = await checkAnswer(state.targetConceptLabel, '(cued combination)', answer, state.originalQuestionRequiresCalculation ? state.originalQuestionExpectedSolution : undefined);
            const notedState = appendNote(state, check.misconceptionNote);
            if (check.correct) {
                await (0, reviewService_1.gradeAndRecordReview)(userId, notedState.conceptKey, 'hard');
                return { done: true, diagnosis: 'transfer', correction: await generateCorrection(notedState.targetConceptLabel, 'transfer', notedState), state: notedState, answerCorrect: true };
            }
            return gateOnWrongAnswer(notedState, notedState.lastShownQuestion || notedState.originalQuestion);
        }
        default:
            throw new Error(`Unknown mechanistic stage: ${state.stage}`);
    }
}
