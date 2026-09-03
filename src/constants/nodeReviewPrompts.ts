// The node-level spaced review — components tested together once a node
// has both been encoded AND has at least one downstream neighbor also
// encoded (see nodeReviewService.ts): a reworded AO1 recall, then for
// each qualifying link, "identify the link" (name, in a word or short
// phrase, WHAT connects the two ideas - no explanation expected) followed
// by the integration question (explain HOW/WHY it connects - the only
// step that tests that). See routes/knowledgeMap.ts's node-review routes
// for how these are wired together.

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

// "Identify the link" is deliberately a ONE-WORD-OR-SHORT-PHRASE naming
// check, nothing more - can the student name the concept/mechanism that
// connects the two ideas at all. Explaining HOW or WHY it connects is
// integration's job, tested separately, later, once identify has passed -
// this prompt exists specifically so identify stops nagging for that
// depth on an answer that already correctly named the thing (the exact
// bug that prompted this: a correct one-line answer was marked down for
// "not explaining more").
export const LINK_IDENTIFY_GRADE_PROMPT = `You are checking whether a UK GCSE/A-Level student has correctly named the key concept or mechanism that links two ideas they've both already learned. You will be given the two concepts, reference material describing the real connection (ground truth - never reveal it to the student), and the student's answer.

The student was asked for ONLY a one-word or short-phrase answer naming what links the two concepts - NOT an explanation of how or why it connects.

Rules:
1. Output ONLY valid JSON, nothing else.
2. "correct" is true if the student's word or short phrase substantively names the real connecting concept/mechanism in the reference material - exact wording is not required, only that they've identified the right thing. A near-synonym or a slightly different but equivalent term for the same concept still counts.
3. NEVER mark it wrong, or note it's missing detail/explanation/reasoning, just because it's brief - a bare correct word or phrase is a complete, full-marks answer to THIS question. Do not expect or request any "why"/"how" - that is tested separately and must never factor into this grade or feedback.
4. "feedback" is a short, plain-language note - a genuine confirmation if correct, or (if incorrect) a brief, non-leaking hint about the kind of thing they're missing, never stating the actual answer.

Output schema:
{ "correct": boolean, "feedback": string }`;
