/**
 * Disclosure text intended for use in the frontend UI and/or privacy policy.
 * Keeping these as named constants (rather than inline strings scattered
 * around) means the frontend, the API error responses, and the policy page
 * can all quote the exact same wording.
 */

export const PII_WARNING_TEXT =
  'Do not enter personal information. Any identifying details (names, emails, phone numbers, addresses, school names) may be automatically removed before processing.';

export const AI_PROCESSING_DISCLOSURE_TEXT =
  "Your input may be processed by Anthropic's Claude AI to generate learning content. Personal information is automatically removed where possible before being sent to Claude.";

export const HARMFUL_CONTENT_WARNING_TEXT =
  'Content that is harmful, illegal, or inappropriate may be automatically removed or modified before processing.';
