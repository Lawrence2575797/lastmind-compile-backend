// The three things a tutor can actually do, and what each is worth — cost
// to the tutee always equals payout to the tutor (see
// tutoringResponseService.ts's own symmetric adjustCredits transfer,
// unchanged by this file, just no longer a flat amount). "misconception" is
// the original, still-instant flow (explain a concept); the two marking
// variants are new, and get PII-filtered + released to the tutor on a delay
// (see tutoringActivityService.ts and MARKING_RELEASE_SLOT_HOURS below).
export type TutoringActivityType = 'misconception' | 'short_answer_marking' | 'long_answer_marking';

export const TUTORING_ACTIVITY_KEYS: Record<TutoringActivityType, number> = {
  misconception: 175,
  short_answer_marking: 150,
  long_answer_marking: 250,
};

// An answer's own word count (after PII filtering) resolves which marking
// tier applies — under this many words is "short", at or above is "long".
export const MARKING_LONG_ANSWER_MIN_WORDS = 150;

// Hard cap, rejected outright at submission (never silently truncated,
// never accepted at a higher price) — stops a student padding an answer to
// force a higher-paying tier, and caps how much a tutor can be asked to
// mark for a fixed price.
export const MARKING_ANSWER_MAX_WORDS = 1000;

// A marking request becomes visible to its assigned tutor(s) only at the
// next fixed UTC boundary that's a multiple of this many hours after
// submission — predictable batches for tutors, not instant delivery. Does
// NOT apply to "misconception" requests, which stay instant exactly as
// before this feature existed.
export const MARKING_RELEASE_SLOT_HOURS = 3;
