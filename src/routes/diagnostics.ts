import { Router, Request, Response } from 'express';
import { callClaudeJSON, MODELS } from '../services/claudeClient';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { MULTI_QUESTION_GENERATION_PROMPT } from '../constants/diagnosticPrompts';
import { runDiagnosticStep, OrchestratorState } from '../services/diagnosticOrchestrator';
import { normalizeConceptKey } from '../services/chainService';

const router = Router();

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

router.use('/diagnostics', requireAuth, costlyEndpointLimiter);

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
  const { subject, topic, conceptLabel, originalQuestion, state, answer, dontKnow } = req.body ?? {};

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

export default router;
