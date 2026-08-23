import { MARKING_LONG_ANSWER_MIN_WORDS, MARKING_RELEASE_SLOT_HOURS, TutoringActivityType } from '../constants/tutoringActivities';

export function countWords(text: string): number {
  const trimmed = (text || '').trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// Resolves a marking request's final activity_type from its (already
// PII-filtered) answer text — 'short_answer_marking' below
// MARKING_LONG_ANSWER_MIN_WORDS, 'long_answer_marking' at or above it. The
// caller is responsible for rejecting anything past MARKING_ANSWER_MAX_WORDS
// before ever calling this — that's a hard reject, not a third tier.
export function classifyMarkingActivity(answerWordCount: number): TutoringActivityType {
  return answerWordCount >= MARKING_LONG_ANSWER_MIN_WORDS ? 'long_answer_marking' : 'short_answer_marking';
}

// The next UTC instant that's an exact multiple of MARKING_RELEASE_SLOT_HOURS
// strictly after `from` — e.g. a request submitted at 10:15 with a 3-hour
// cadence becomes visible at 12:00, not immediately and not at the NEXT
// slot after that. Used only for marking requests; misconception requests
// pass `visible_at: now()` directly and never call this.
export function nextReleaseSlot(from: Date): Date {
  const slotMs = MARKING_RELEASE_SLOT_HOURS * 60 * 60 * 1000;
  return new Date((Math.floor(from.getTime() / slotMs) + 1) * slotMs);
}
