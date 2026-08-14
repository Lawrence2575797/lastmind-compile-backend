import { callClaudeJSON, MODELS } from './claudeClient';
import { getMasteryStatus } from './reviewService';
import { RECOGNITION_QUESTION_PROMPT } from '../constants/diagnosticPrompts';

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

// RECOGNITION_QUESTION_PROMPT has no instruction about WHERE to place the
// correct option, and in practice models default to putting it first (or
// some other fixed position) far more often than chance would — telling a
// model "randomize this" doesn't reliably produce a uniform distribution,
// so this is done deterministically in code instead, after the model has
// already picked the option content and correctOptionIndex. Shuffles a
// parallel index array (standard Fisher-Yates) rather than the options
// array directly, so tracking where the correct answer ended up is just
// "where did its original index land" — no error-prone swap bookkeeping.
function shuffleOptions(options: string[], correctOptionIndex: number): { options: string[]; correctOptionIndex: number } {
  const indices = options.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return {
    options: indices.map((i) => options[i]),
    correctOptionIndex: indices.indexOf(correctOptionIndex),
  };
}

export type EncodingCheckOutcome =
  | { result: 'encoding_failure' }
  | { result: 'schedule_miscalibrated' }
  | { result: 'decay_schedule_skipped' }
  | { result: 'retrieval_confirmed' }
  | { result: 'needs_recognition_test'; question: string; options: string[]; correctAnswer: string };

/**
 * The shared encoding-vs-retrieval check — runs BEFORE any atomic/
 * mechanistic branching, exactly matching the agreed tree order (section 2
 * applies regardless of which branch comes next). Extracted here rather
 * than left inside either engine specifically so both the atomic and
 * mechanistic engines can call it without importing each other.
 */
export async function runSharedEncodingCheck(userId: string, conceptId: string, conceptLabel: string, subject: string): Promise<EncodingCheckOutcome> {
  const mastery = await getMasteryStatus(userId, conceptId);

  if (mastery.isMastered) {
    if (mastery.scheduleWasFollowed === true) {
      return { result: 'schedule_miscalibrated' };
    }
    return { result: 'decay_schedule_skipped' };
  }

  // Subject is essential, not optional context — a bare abbreviation-style
  // label (e.g. "MRS") is genuinely ambiguous without it: real-world
  // testing produced a recognition question treating "MRS" as the
  // honorific "Mrs" (offering "a married woman" as an option) because the
  // prompt had nothing telling it this was an Economics term. See
  // RECOGNITION_QUESTION_PROMPT's own disambiguation rule.
  const recognition = await callClaudeJSON({
    model: MODELS.diagnosticTree,
    systemPrompt: RECOGNITION_QUESTION_PROMPT,
    userContent: `Subject: ${subject || 'unspecified'}\nConcept: ${conceptLabel}`,
    temperature: 0.3,
  }).then((raw) => JSON.parse(stripCodeFences(raw)) as { question: string; options: string[]; correctOptionIndex: number });

  const shuffled = shuffleOptions(recognition.options, recognition.correctOptionIndex);

  return {
    result: 'needs_recognition_test',
    question: recognition.question,
    options: shuffled.options,
    correctAnswer: shuffled.options[shuffled.correctOptionIndex],
  };
}
