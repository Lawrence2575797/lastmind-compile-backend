/**
 * HARMFUL CONTENT FILTER — cleans, does not block.
 *
 * Replaces obviously harmful segments with [HARMFUL_CONTENT_REMOVED] rather
 * than rejecting the whole request, per spec.
 *
 * Important limitation, stated plainly rather than glossed over: a keyword
 * list is a weak primary defence on its own. It's trivially bypassed by
 * misspellings, spacing tricks, or rephrasing, and it produces false
 * positives on entirely legitimate content (a GCSE history or politics
 * student writing about WWII, terrorism, or conflict studies will trip
 * generic keyword matches constantly). Treat this as a cheap first-pass
 * net, not the thing actually keeping the system safe — that job belongs
 * to Claude's own safety training, which runs regardless on every request
 * per Anthropic's usage policies. For anything beyond a hobby/small-scale
 * deployment, a proper moderation approach (e.g. a dedicated moderation
 * model/service) would catch far more than string matching ever will.
 *
 * The list below is intentionally a small, generic illustrative set —
 * expand it according to your own moderation policy rather than treating
 * this as exhaustive.
 */

interface HarmfulPattern {
  pattern: RegExp;
}

const HARMFUL_PATTERNS: HarmfulPattern[] = [
  { pattern: /\bhow to (make|build) a bomb\b/gi },
  { pattern: /\bbomb[- ]making instructions\b/gi },
  { pattern: /\bhow to (make|build|acquire) (a )?(gun|firearm|explosive)s?\b/gi },
  { pattern: /\bhow to (kill|murder) (someone|a person|him|her|them)\b/gi },
  { pattern: /\bsuicide method(s)?\b/gi },
  { pattern: /\bhow to (self-harm|hurt myself)\b/gi },
  { pattern: /\bterrorist attack (plan|planning)\b/gi },
  { pattern: /\bjoin (a |the )?terrorist (group|organisation|organization)\b/gi },
  { pattern: /\bhow to make (poison|a poison|nerve agent)\b/gi },
];

export function applyHarmfulContentFilter(text: string): string {
  let result = text;

  for (const { pattern } of HARMFUL_PATTERNS) {
    result = result.replace(pattern, '[HARMFUL_CONTENT_REMOVED]');
  }

  return result;
}
