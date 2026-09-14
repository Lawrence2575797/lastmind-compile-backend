// Fixed pools of genuine, non-generic encouragement copy - deliberately NOT
// Claude-generated per message (no latency/cost on something this frequent,
// and a model asked to be "warm" on every single correct answer drifts into
// exactly the hollow, exclamation-mark-heavy tone this is trying to avoid).
// The "personalisation" is in which pool gets picked and the name
// substitution (see encouragementService.ts's pickEncouragementMessage), not
// in generating the sentence itself.
//
// CORRECT_MESSAGES: the everyday case - a normal correct answer, no prior
// wrong attempt this question. Short, varied in phrasing/register, never
// twee. {name} is optional in any entry - substituted when present, and the
// message reads fine without it, since not every account has a usable name.
export const CORRECT_MESSAGES: string[] = [
  "Nice - that's locked in.",
  'Clean answer.',
  "That's exactly right.",
  'Correct - and you got there directly.',
  'Solid. Onward.',
  "Yep, that's it.",
  'Right on the first read.',
  'Good - no hesitation there.',
  "That's the kind of answer that sticks.",
  'Correct.',
];

// TOUGH_CONCEPT_MESSAGES: shown when the same question needed at least one
// wrong attempt first (see the retryCount > 0 check at each call site) - the
// student just turned something that was genuinely fighting them into
// something they've got. Heartfelt on purpose, but still specific and
// earned rather than generic praise - these should read like they're about
// THIS moment, not a template that could sit under any win.
export const TOUGH_CONCEPT_MESSAGES: string[] = [
  "That one didn't come easy, and you got there anyway{name} - that's the whole game.",
  "You just turned a concept that was working against you into one you've actually got{name}. That's real progress, not luck.",
  'The version of you from a few minutes ago was still getting this wrong{name}. Notice that.',
  "That's what it looks like when something clicks{name} - not instantly, but for real.",
  "Most people quit before it turns into that{name}. You didn't.",
  "You earned that one{name} - it fought back and you still got there.",
  "That's the hard way to learn something, and also the way it actually sticks{name}.",
  "Genuinely well done{name} - that concept was not giving you an easy path in.",
];

// {name} substitution - ", {name}" when a usable name exists, otherwise
// removed entirely (never renders as a dangling ", " or a literal
// "{name}"). Every TOUGH_CONCEPT_MESSAGES entry places {name} mid-sentence
// specifically so removing it still reads as a complete, natural sentence.
export function fillEncouragementTemplate(template: string, name?: string | null): string {
  const trimmedName = (name || '').trim();
  return template.replace(/\{name\}/g, trimmedName ? `, ${trimmedName}` : '');
}
