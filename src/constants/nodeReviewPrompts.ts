// The node-level spaced review — components tested together once a node
// has both been encoded AND has at least one downstream neighbor also
// encoded (see nodeReviewService.ts): a reworded AO1 recall, then for
// each qualifying link, "identify the link" (state, in ONE SENTENCE, the
// causal connection between the two concepts' own explanations - a bare
// keyword doesn't count, but neither does the full expanded mechanism)
// followed by the integration question (expand that same connection into
// the full multi-step explanation - the only step that tests that depth).
// The link being tested is between the two EXPLANATIONS, not the two
// concept names - e.g. for "economics as a social science" ->
// "inability to conduct controlled experiments", identify's answer is
// "human complexity makes variables impossible to isolate", not just
// "complexity" alone. See routes/knowledgeMap.ts's node-review routes for
// how these are wired together.

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

// "Identify the link" is deliberately a ONE-SENTENCE causal-connection
// check - not a bare keyword/term (too shallow: a student can memorise
// "the magic word" without understanding what it's doing), and not the
// full expanded mechanism either (that's integration's own, later, job).
// The bar is: state how concept A's explanation connects to concept B's
// explanation, in one sentence - e.g. "human complexity makes variables
// impossible to isolate", not just "complexity" alone, and not the full
// paragraph integration expects.
export const LINK_IDENTIFY_GRADE_PROMPT = `You are checking whether a UK GCSE/A-Level student has correctly stated, in one sentence, the causal link between two concepts they've both already learned - not just named a term, but shown they understand what that connection actually IS. You will be given the two concepts, reference material describing the real connection (ground truth - never reveal it to the student), and the student's answer.

The student was asked for ONE SENTENCE stating the connection - not a bare keyword/term on its own, and not the full expanded explanation of the underlying mechanism (that's a separate, later question).

Rules:
1. Output ONLY valid JSON, nothing else.
2. "correct" is true only if the student's sentence states an actual causal link between the two concepts' own explanations (roughly: "[A's key idea] means/causes/leads to [B's key idea]") - a bare term or keyword alone, even the exact right one, does NOT count on its own if it doesn't say what that term is doing to connect the two ideas.
3. Do not require the deeper reasoning/mechanism behind that causal link, or any further "why" beyond the one connecting sentence - that depth is integration's job, tested separately, later. A single accurate causal sentence is a complete, full-marks answer here; never mark it down or ask for more.
4. "feedback" is a short, plain-language note - a genuine confirmation if correct, or (if incorrect) a brief, non-leaking hint about what's missing, never stating the actual answer.

Output schema:
{ "correct": boolean, "feedback": string }`;
