import { Router, Request, Response } from 'express';
import { callClaudeJSON, MODELS } from '../services/claudeClient';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter } from '../services/rateLimiters';
import { MULTI_QUESTION_GENERATION_PROMPT } from '../constants/diagnosticPrompts';
import { processDiagnosticAnswer, DiagnosticState } from '../services/diagnosticEngine';

const router = Router();

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

router.use('/diagnostics', requireAuth, costlyEndpointLimiter);

// POST /diagnostics/generate-set
// { subject, topic, lesson, notes } -> { questions: [{ conceptLabel, question }] }
// The AI decides how many questions to generate, based on concept density
// in the lesson/notes — not a fixed count.
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
// { subject, conceptLabel, originalQuestion, state, answer, dontKnow }
// The single stateful entry point for the whole diagnostic flow — the
// frontend just passes back whatever `state` it was last given, and this
// endpoint (via the engine) decides everything about what happens next.
router.post('/diagnostics/submit-answer', async (req: Request, res: Response) => {
  const { subject, conceptLabel, originalQuestion, state, answer, dontKnow } = req.body ?? {};

  // On the very first call for a question, there's no state yet — build it.
  const currentState: DiagnosticState = state || {
    conceptLabel,
    subject: subject || '',
    stage: 'initial',
    originalQuestion,
  };

  if (!currentState.conceptLabel || !currentState.originalQuestion) {
    return res.status(400).json({ error: 'conceptLabel and originalQuestion are required (directly, or within state)' });
  }

  try {
    const result = await processDiagnosticAnswer(
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
