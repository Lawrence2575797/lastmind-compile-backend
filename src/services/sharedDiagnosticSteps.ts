import { callClaudeJSON, MODELS } from './claudeClient';
import { getMasteryStatus } from './reviewService';
import { RECOGNITION_QUESTION_PROMPT } from '../constants/diagnosticPrompts';

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
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
export async function runSharedEncodingCheck(userId: string, conceptId: string, conceptLabel: string): Promise<EncodingCheckOutcome> {
  const mastery = await getMasteryStatus(userId, conceptId);

  if (mastery.isMastered) {
    if (mastery.scheduleWasFollowed === true) {
      return { result: 'schedule_miscalibrated' };
    }
    return { result: 'decay_schedule_skipped' };
  }

  const recognition = await callClaudeJSON({
    model: MODELS.diagnosticTree,
    systemPrompt: RECOGNITION_QUESTION_PROMPT,
    userContent: `Concept: ${conceptLabel}`,
    temperature: 0.3,
  }).then((raw) => JSON.parse(stripCodeFences(raw)) as { question: string; options: string[]; correctOptionIndex: number });

  return {
    result: 'needs_recognition_test',
    question: recognition.question,
    options: recognition.options,
    correctAnswer: recognition.options[recognition.correctOptionIndex],
  };
}
