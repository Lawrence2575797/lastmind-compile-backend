import { CORRECT_MESSAGES, TOUGH_CONCEPT_MESSAGES, fillEncouragementTemplate } from '../constants/encouragementMessages';

// Stateless by design - no server-side "already shown" tracking (this
// endpoint is fired on nearly every correct answer across the app; a
// per-user history table for it would be a lot of write volume for a
// purely cosmetic feature). Instead the caller passes back the last few
// messages it already displayed THIS session (see learn/index.html's
// sfRecentEncouragements) and this just avoids picking one of those again
// - a light "don't immediately repeat", not a durable record of what's
// been shown.
export function pickEncouragementMessage(
  toughConcept: boolean,
  studentName: string | null | undefined,
  recentlyShown: string[]
): string {
  const pool = toughConcept ? TOUGH_CONCEPT_MESSAGES : CORRECT_MESSAGES;
  const recentSet = new Set((recentlyShown || []).filter((s) => typeof s === 'string'));
  // Fill every template FIRST, then filter by the filled (actually
  // displayed) text - recentlyShown is what the frontend displayed, which
  // already has {name} substituted, so comparing pre-substitution
  // templates against it would never match and "don't repeat" would
  // silently do nothing.
  const filled = pool.map((template) => fillEncouragementTemplate(template, studentName));
  const candidates = filled.filter((msg) => !recentSet.has(msg));
  const finalPool = candidates.length ? candidates : filled; // every entry was recently shown - the pool's just small, allow a repeat rather than return nothing
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}
