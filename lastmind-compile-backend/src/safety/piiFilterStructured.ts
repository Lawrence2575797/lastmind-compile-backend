/**
 * Filter 1 — STRUCTURED PII REMOVAL (regex-based).
 *
 * Detects recognisable *shapes* of PII (an email always looks like an
 * email, a UK postcode always follows the same pattern) and replaces them
 * with placeholders. This runs before Filter 2 (contextual removal), since
 * contextual phrase-matching works on whatever structured PII is left.
 *
 * Order matters: email is matched before the social-handle pattern, since
 * an email's "@" would otherwise also match "@handle" and get replaced
 * twice / inconsistently.
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// UK-style numbers: an optional leading +44 or 0, then 9–10 digits, allowing
// spaces or dashes between digit groups (e.g. "07911 123456", "020-7946-0958").
const PHONE_REGEX = /\b(?:\+44[\s-]?|0)(?:\d[\s-]?){9,10}\b/g;

// Standard UK postcode pattern (outward + inward code).
const POSTCODE_REGEX = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi;

// A house/building number followed by a word, then a common street suffix.
const ADDRESS_REGEX =
  /\b\d{1,4}\s+[A-Za-z]+(?:\s+[A-Za-z]+)?\s+(?:Street|Road|Avenue|Lane|Close|Drive|Court|Way|Place|Square|Gardens|Grove|Crescent|Terrace|Hill|Park)\b/gi;

// "@username" style social handles.
const HANDLE_REGEX = /(?<![\w.@])@\w{2,30}\b/g;

// 16-digit card-like numbers, optionally grouped in 4s with spaces or dashes.
const CARD_REGEX = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;

export function applyStructuredPIIFilter(text: string): string {
  let result = text;

  result = result.replace(EMAIL_REGEX, '[EMAIL]');
  result = result.replace(CARD_REGEX, '[CARD]');
  result = result.replace(POSTCODE_REGEX, '[POSTCODE]');
  result = result.replace(ADDRESS_REGEX, '[ADDRESS]');
  result = result.replace(PHONE_REGEX, '[PHONE]');
  result = result.replace(HANDLE_REGEX, '[HANDLE]');

  return result;
}
