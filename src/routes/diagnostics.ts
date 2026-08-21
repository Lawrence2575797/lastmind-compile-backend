import { Router, Request, Response } from 'express';
import { callClaudeJSON, MODELS } from '../services/claudeClient';
import { requireAuth, requirePaidTier } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { MULTI_QUESTION_GENERATION_PROMPT } from '../constants/diagnosticPrompts';
import { runDiagnosticStep, startDiagnosisFromKnownAnswer, startMathDiagnosis, reframeDiagnosticQuestion, retryDiagnosticQuestion, OrchestratorState } from '../services/diagnosticOrchestrator';
import { normalizeConceptKey } from '../services/chainService';

const router = Router();

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

router.use('/diagnostics', requireAuth, requirePaidTier, costlyEndpointLimiter);

// POST /diagnostics/generate-set
// { subject, topic, lesson, notes } -> { questions: [{ conceptLabel, question }] }
// The AI decides how many questions to generate, based on concept density.
router.post('/diagnostics/generate-set', async (req: Request, res: Response) => {
  const { subject, topic, lesson, notes } = req.body ?? {};
  if (!topic && !lesson) {
    return res.status(400).json({ error: 'topic or lesson is required' });
  }

  try {
    const userContent = [
      `Subject: ${subject || 'unspecified'}`,
      `Topic: ${topic || 'unspecified'}`,
      `Lesson: ${lesson || 'unspecified'}`,
      notes ? `Student's notes:\n${notes}` : 'No notes provided — base questions on the topic/lesson description alone.',
    ].join('\n');

    const raw = await callClaudeJSON({
      model: MODELS.diagnosticTree,
      systemPrompt: MULTI_QUESTION_GENERATION_PROMPT,
      userContent,
      temperature: 0.3,
      // Same 2048-token default truncation bug fixed elsewhere across the
      // diagnostic/encoding services (see sharedDiagnosticSteps.ts) — a
      // whole question set is easily long enough to need the room.
      maxTokens: 4096,
    });

    const parsed = JSON.parse(stripCodeFences(raw));
    res.json(parsed);
  } catch (err) {
    console.error('Question set generation failed:', err);
    res.status(500).json({ error: 'could not generate questions' });
  }
});

// POST /diagnostics/submit-answer
// { subject, topic, conceptLabel, originalQuestion, state, answer, dontKnow }
// The single stateful entry point for the whole diagnostic flow (atomic
// AND mechanistic) — the frontend just passes back whatever `state` it
// was last given; the orchestrator decides everything from there.
router.post('/diagnostics/submit-answer', async (req: Request, res: Response) => {
  const { subject, topic, conceptLabel, originalQuestion, state, answer, dontKnow, qualification, examBoard } = req.body ?? {};

  // The concept key MUST use the same normalization chains.ts uses
  // (subject:topic:concept, cleaned) — using the raw label alone here was
  // a real bug: a chain generated under the proper key could never match
  // what the diagnostic engine was looking up, silently forcing every
  // session onto the atomic (no chain-awareness) path.
  const conceptKey = normalizeConceptKey(subject || '', topic || '', conceptLabel || '');

  const currentState: OrchestratorState = state || {
    engine: 'pending',
    conceptKey,
    conceptLabel,
    subject: subject || '',
    topic: topic || '',
    originalQuestion,
    slipStage: 'initial',
    qualification: typeof qualification === 'string' ? qualification : '',
    examBoard: typeof examBoard === 'string' ? examBoard : '',
  };

  try {
    const result = await runDiagnosticStep(
      req.userId as string,
      currentState,
      typeof answer === 'string' ? answer : '',
      !!dontKnow
    );
    res.json(result);
  } catch (err) {
    console.error('Diagnostic answer processing failed:', err);
    res.status(500).json({ error: 'could not process this answer' });
  }
});

// POST /diagnostics/reframe-question  { state } -> OrchestratorResult-shaped
// { done, nextQuestion, nextOptions, state, nextRequiresCalculation }
// On-demand reword of whatever question is currently shown — the frontend
// side-button replacement for the old mandatory "did you understand the
// wording?" question. Does not advance the diagnostic stage or grade
// anything; the returned `state` should just replace whatever the caller
// was already holding.
router.post('/diagnostics/reframe-question', async (req: Request, res: Response) => {
  const { state } = req.body ?? {};
  if (!state) {
    return res.status(400).json({ error: 'state is required (whatever the previous diagnostic call returned)' });
  }

  try {
    const result = await reframeDiagnosticQuestion(state as OrchestratorState);
    res.json(result);
  } catch (err) {
    console.error('Diagnostic reframe failed:', err);
    res.status(500).json({ error: 'could not reword this question' });
  }
});

// POST /diagnostics/start-from-answer
// { conceptKey, conceptLabel, subject, topic, question, forceAtomic } -> OrchestratorResult
// For a caller that already knows an answer is wrong and has already
// graded it — skips the shared slip-check re-grading (see
// startDiagnosisFromKnownAnswer for why). Unlike /submit-answer, conceptKey
// is used EXACTLY as given, never re-derived via normalizeConceptKey —
// callers may be diagnosing an individual chain node (e.g. a prerequisite),
// not just a top-level lesson concept, and chain nodes are tracked by
// their own raw id elsewhere in this codebase (see mechanisticEngine.ts).
router.post('/diagnostics/start-from-answer', async (req: Request, res: Response) => {
  const { conceptKey, conceptLabel, subject, topic, question, forceAtomic, qualification, examBoard } = req.body ?? {};
  if (typeof conceptKey !== 'string' || typeof conceptLabel !== 'string' || typeof question !== 'string') {
    return res.status(400).json({ error: 'conceptKey, conceptLabel, and question are all required' });
  }

  try {
    const result = await startDiagnosisFromKnownAnswer(
      req.userId as string,
      conceptKey,
      conceptLabel,
      subject || '',
      topic || '',
      question,
      !!forceAtomic,
      undefined,
      undefined,
      typeof qualification === 'string' ? qualification : '',
      typeof examBoard === 'string' ? examBoard : ''
    );
    res.json(result);
  } catch (err) {
    console.error('Diagnostic start-from-answer failed:', err);
    res.status(500).json({ error: 'could not start diagnosis' });
  }
});

// POST /diagnostics/start-math-from-answer
// { conceptKey, conceptLabel, subject, topic, question, contentKey, stepIndex, studentWorking, forceAtomic } -> OrchestratorResult
// The calculation-question counterpart to /diagnostics/start-from-answer
// (see startMathDiagnosis) — starts by locating exactly where the
// student's OWN shown working went wrong, rather than jumping straight
// into the theory-question diagnostic tree. contentKey/stepIndex let the
// backend re-fetch the verified expectedSolution itself from the
// encoding_lesson_content cache — never trusted from the client, same
// security reasoning as submitEncodingAnswer's own grading.
router.post('/diagnostics/start-math-from-answer', async (req: Request, res: Response) => {
  const { conceptKey, conceptLabel, subject, topic, question, contentKey, stepIndex, studentWorking, forceAtomic, qualification, examBoard } = req.body ?? {};
  if (
    typeof conceptKey !== 'string' ||
    typeof conceptLabel !== 'string' ||
    typeof question !== 'string' ||
    typeof contentKey !== 'string' ||
    typeof stepIndex !== 'number'
  ) {
    return res.status(400).json({ error: 'conceptKey, conceptLabel, question, contentKey, and stepIndex are all required' });
  }

  try {
    const result = await startMathDiagnosis(
      req.userId as string,
      conceptKey,
      conceptLabel,
      subject || '',
      topic || '',
      question,
      contentKey,
      stepIndex,
      typeof studentWorking === 'string' ? studentWorking : '',
      !!forceAtomic,
      typeof qualification === 'string' ? qualification : '',
      typeof examBoard === 'string' ? examBoard : ''
    );
    res.json(result);
  } catch (err) {
    console.error('Diagnostic start-math-from-answer failed:', err);
    res.status(500).json({ error: 'could not start diagnosis' });
  }
});

// POST /diagnostics/report-slip
// { state } -> OrchestratorResult-shaped { done: false, nextQuestion, nextOptions?, state }
// The "this was just a slip" side button — re-serves the exact same
// question the student just got wrong, for a genuine second attempt.
// Previously this trusted the self-report at face value with zero
// verification (graded 'hard' and ended the diagnosis outright on nothing
// but the claim) — a real mistake could be waved through that way. Retrying
// means a real slip gets caught by the student actually getting it right
// this time (graded normally through the usual answer-processing path,
// same as any other correct answer), and a real gap still surfaces through
// the usual wrong-answer escalation if they get it wrong again.
router.post('/diagnostics/report-slip', async (req: Request, res: Response) => {
  const { state } = req.body ?? {};
  if (!state) {
    return res.status(400).json({ error: 'state is required (from the diagnostic question this was reported on)' });
  }

  try {
    const result = retryDiagnosticQuestion(state as OrchestratorState);
    res.json(result);
  } catch (err) {
    console.error('Diagnostic slip retry failed:', err);
    res.status(500).json({ error: 'could not retry this question' });
  }
});

export default router;
