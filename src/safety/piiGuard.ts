import { applyStructuredPIIFilter } from './piiFilterStructured';
import { applyContextualPIIFilter } from './piiFilterContextual';

/**
 * DETECT-AND-REJECT, not sanitize-and-continue.
 *
 * piiFilterStructured.ts/piiFilterContextual.ts's existing job (used today
 * in routes/compile.ts and the peer-tutoring services) is to silently
 * blank PII and let a sanitized version continue - a deliberate "cleans,
 * does not block" design, stated explicitly in both those files' own
 * comments. This is a genuinely different, stricter behavior for raw
 * conversational AI inputs (a lesson answer, a chat message, a follow-up
 * question) - if PII is detected at all, the request is refused outright
 * before anything reaches Claude, rather than quietly stripping it and
 * proceeding. Real motivating case: a student typed their actual home
 * address into a live Italian-practice conversation and the model echoed
 * it straight back - "sanitize and continue" would still have let that
 * conversation happen on the cleaned text; this refuses it instead.
 *
 * Detection reuses the existing filters' own patterns rather than
 * duplicating them - "would either filter have changed this text" IS the
 * detection signal, so the two systems can never drift out of sync with
 * each other.
 */
export function containsPII(text: string): boolean {
  return applyContextualPIIFilter(applyStructuredPIIFilter(text)) !== text;
}

// Thrown by assertNoPII so a route's catch block can tell this apart from
// a genuine server error and respond with the specific, actionable
// message below instead of a generic 500.
export class PIIDetectedError extends Error {
  constructor() {
    super('personal information detected');
    this.name = 'PIIDetectedError';
  }
}

export function assertNoPII(text: string): void {
  if (containsPII(text)) throw new PIIDetectedError();
}

// Shared verbatim across every route that catches PIIDetectedError, so a
// student sees the exact same guidance regardless of which feature they
// hit it in.
export const PII_ERROR_MESSAGE =
  "That looks like it might contain personal information (a name, address, phone number, email, or similar) — please remove it and try again. Never share real personal details in a lesson or chat.";
