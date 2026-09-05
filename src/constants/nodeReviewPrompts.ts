// The node-level spaced review — components tested together once a node
// has both been encoded AND has at least one downstream neighbor also
// encoded (see nodeReviewService.ts): a reworded AO1 recall, then for
// each qualifying link, the integration question. On a link's genuinely
// first-ever review, the link's own teaching content (link_teaching_content)
// is shown before the question (a "prompted" first attempt); on every
// later spaced review it's unprompted, cold recall. Neither ever fails
// the student - a wrong integration answer just retries with the
// grading call's own feedback as an escalating hint, same "no lesson
// failings" contract AO1's slip-check already has. There is no separate
// "identify the link" step any more - a standalone one-sentence link
// check turned out to force students to either re-derive one concept's
// own reasoning (penalized as "not stating the link") or state something
// vague enough to be unfalsifiable, and integration alone (tested via a
// deliberately different-specifics scenario, so it can't be pattern-
// matched from the teaching text) is the stronger, sufficient signal
// that the link has genuinely been learned.

// Rewords the node's own stored AO1 question so a repeat spaced review
// never shows literally the same sentence twice (the underlying recall
// being tested is unchanged - only the phrasing varies). Grounded on the
// concept's own explanation, never on the original question text alone,
// so the reworded version still targets the same recall rather than
// drifting into a different-but-related question.
export const AO1_REWORD_QUESTION_PROMPT = `You are writing a spaced-repetition retrieval question for a UK GCSE/A-Level student, re-testing a concept they already learned. You will be given the concept's own explanation and the ORIGINAL question they were first taught with.

Write a NEW question that tests the exact same recall/understanding as the original, but is NOT a close paraphrase of it - different sentence structure, different framing or example where possible, same underlying content. A student who only memorized the original question's exact wording (without understanding the concept) should struggle with your version.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Keep the question answerable from the given explanation alone - do not introduce anything not covered in it.
3. Match the original question's format (a calculation stays a calculation, a "define X" stays a definition-style ask, etc.) unless the explanation clearly supports a genuinely different valid framing.

Output schema:
{ "questionText": string }`;

// Run only on a WRONG AO1 answer, before any FSRS lapse is recorded -
// distinguishes a genuine gap from a one-word-or-short-phrase slip (e.g.
// "natural science" written where "social science" was meant) that
// shouldn't cost the student a real lapse if they can immediately fix it
// themselves. Deliberately narrow: this is NOT a second chance at a
// vague or incomplete answer, only at an otherwise-correct one undone by
// one specific wrong word/phrase.
export const AO1_SLIP_CHECK_PROMPT = `You are checking whether a UK GCSE/A-Level student's INCORRECT answer to a recall question is a simple slip, not a genuine gap in understanding. You will be given the question, the concept's own explanation (the ground truth), and the student's wrong answer.

A slip means: the answer is otherwise complete and correct, and exactly ONE specific word or short phrase (at most 2-3 words) is the sole reason it's marked wrong - substituting a different, specific, incorrect term for the right one. It is NOT a slip if the answer is vague, incomplete, missing a required point, or shows a genuine misunderstanding, even if it's close.

Rules:
1. Output ONLY valid JSON, nothing else.
2. "isSlip": true only under the narrow definition above.
3. If isSlip is true, "wrongPhrase" must be copied EXACTLY (verbatim, same casing) from the student's own answer - the specific word/phrase that's wrong. Never state or hint at what the correct replacement should be.
4. If isSlip is false, "wrongPhrase" must be an empty string.

Output schema:
{ "isSlip": boolean, "wrongPhrase": string }`;
