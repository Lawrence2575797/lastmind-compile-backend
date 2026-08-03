/**
 * Filter 2 — CONTEXTUAL PII REMOVAL (phrase/heuristic-based).
 *
 * Runs AFTER Filter 1, on text that's already had structured PII replaced.
 * This catches PII that doesn't have a fixed shape a regex alone can spot —
 * a name, a school name, a teacher's name — by looking for the common
 * lead-in phrases students actually use, and blanking out whatever follows
 * up to the next punctuation mark or line break.
 *
 * This is deliberately simple string/regex matching, not NLP — per spec,
 * it will occasionally over- or under-match on unusual phrasing (e.g. "my
 * teacher is really strict" gets partially blanked the same as "my teacher
 * Mr Adams" would). That's an inherent limit of heuristic matching without
 * ML, not a bug — flagging it so it's not mistaken for one.
 */

interface ContextualRule {
  pattern: RegExp;
  replacement: string;
}

// Each pattern captures the lead-in phrase in group 1 and blanks everything
// after it up to a sentence-ending punctuation mark or newline.
const CONTEXTUAL_RULES: ContextualRule[] = [
  { pattern: /\b(my name is)\s+[^.,;\n]+/gi, replacement: '$1 [NAME]' },
  { pattern: /\b(i live at)\s+[^.,;\n]+/gi, replacement: '$1 [ADDRESS]' },
  { pattern: /\b(my email is)\s+[^.,;\n]+/gi, replacement: '$1 [EMAIL]' },
  { pattern: /\b(my phone number is)\s+[^.,;\n]+/gi, replacement: '$1 [PHONE]' },
  { pattern: /\b(i go to)\s+[^.,;\n]+/gi, replacement: '$1 [SCHOOL]' },
  { pattern: /\b(my teacher)\s+[^.,;\n]+/gi, replacement: '$1 [TEACHER]' },
  { pattern: /\b(my mum works at)\s+[^.,;\n]+/gi, replacement: '$1 [WORKPLACE]' },
];

export function applyContextualPIIFilter(text: string): string {
  let result = text;

  for (const rule of CONTEXTUAL_RULES) {
    result = result.replace(rule.pattern, rule.replacement);
  }

  return result;
}
