// The node-level spaced review — three components tested together once a
// node has both been encoded AND has at least one downstream neighbor
// also encoded (see nodeReviewService.ts): a reworded AO1 recall, then
// "identify the link" (transfer, in disguise - don't name the connection,
// just describe it) with prompted retry until correct, then the existing
// integration question. See routes/knowledgeMap.ts's node-review routes
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

// The "identify the link" question - deliberately does NOT ask the
// student to explain HOW the two concepts connect (that's the integration
// question, asked only after this passes) - just to state THAT they
// connect and roughly in what way, without the question itself giving
// that away. Grounded on the edge's own link-teaching content.
export const LINK_IDENTIFY_QUESTION_PROMPT = `You are writing a spaced-repetition question for a UK GCSE/A-Level student. You will be given two concepts they have both already learned, and the reference material describing how the first leads into/connects to the second.

Write a free-text question that asks the student to identify that these two concepts ARE connected and briefly what the connection is - without the question itself naming or describing the connection (that would give the answer away). The question should name both concepts, then ask something like what links them or how the first one leads to the second - phrase it in your own way, matching UK exam-question style.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Never reveal the actual connection in the question text itself.
3. Keep it answerable in a few sentences, not a full essay.

Output schema:
{ "questionText": string }`;

export const LINK_IDENTIFY_GRADE_PROMPT = `You are grading a UK GCSE/A-Level student's answer to a question asking them to identify the connection between two concepts. You will be given the question, the reference material describing the real connection, and the student's answer.

Rules:
1. Output ONLY valid JSON, nothing else.
2. "correct" is true only if the student's answer genuinely identifies the real connection described in the reference material - a vague "they're related" or a guess that happens to not be wrong isn't enough, but you do not need the student's wording to match the reference material closely, only the substance.
3. "feedback" is a short, plain-language note to the student - a genuine confirmation if correct, or (if incorrect) an honest but non-leaking note of what's missing or wrong, never stating the actual connection.

Output schema:
{ "correct": boolean, "feedback": string }`;

// Fired only when LINK_IDENTIFY_GRADE_PROMPT returns incorrect - a hint
// toward the SAME question, not a new one, so the student is still
// working out the real connection rather than being handed a different
// easier question. Retried until correct (see routes/knowledgeMap.ts) -
// no FSRS lapse is recorded for these interim wrong attempts, matching
// this app's existing "a wrong first-time attempt is a learning rep, not
// a real recall test" convention for anything with a prompted retry loop.
export const LINK_IDENTIFY_HINT_PROMPT = `You are helping a UK GCSE/A-Level student who just answered a "how do these two concepts connect" question incorrectly. You will be given the question, the reference material describing the real connection (never reveal this to the student), their wrong answer, and the feedback they were already given.

Write a short hint that nudges them toward the real connection - point them at what to think about next, without stating the connection itself. They will be asked the same question again after this.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Never state the actual connection, directly or by strong implication - a hint that effectively gives the answer away defeats the entire point of testing recall.

Output schema:
{ "hint": string }`;
