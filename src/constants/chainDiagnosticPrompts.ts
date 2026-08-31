// Prompts for the knowledge-map "jump ahead" gate — see
// chainDiagnosticService.ts. A student trying to start a lesson whose
// prerequisites they haven't covered gets ONE combined free-text question
// covering the whole unmastered chain, rather than a per-node checkbox
// wizard: this is meant to feel like "show me you can actually place this
// in context," not a form to fill in.

export interface ChainDiagnosticComponentInput {
  index: number;
  type: 'encoding' | 'transfer' | 'integration';
  label: string; // "the demand curve", "how X leads to Y", etc — display label
  groundTruth: string; // never shown to the student — reference only for the question-writer/grader
}

// Writes the single combined question. Given the ordered chain of gap
// concepts/links (earliest prerequisite first, working toward the target),
// asks the student to define each concept AND state how each links to the
// next — all in one written response, not one box per item. Concepts are
// named explicitly (that's the encoding check's whole point — testing a
// definition requires naming what to define), but the target concept
// itself and the SPECIFIC nature of each link are never given away — the
// student has to actually produce the definitions and the connections
// themselves, matching how the edge lessons themselves are written to
// never explain a "leads to" concept in advance.
export const CHAIN_DIAGNOSTIC_QUESTION_PROMPT = `You are writing ONE combined free-text question for a student who is trying to jump straight to a concept without having covered the concepts that lead up to it. The question must test, in a single written response: (a) whether they can define each of the listed prerequisite concepts, and (b) whether they can explain how each one connects to the next, building up toward the target.

You will be given: the target concept's name (context only — so the student knows what they're working toward, never explain or hint at the target's own content), and the ordered chain of prerequisite concepts with their real definitions (reference only, never reveal these).

Rules:
1. Output ONLY valid JSON, nothing else.
2. Name every prerequisite concept explicitly in the question — the student can't be expected to define something they aren't told to define. Ask for a definition of each, in their own words.
3. Also ask the student to explain, for each consecutive pair in the chain, how the earlier concept leads to or connects with the later one — phrase this as genuinely asking them to work it out and state it, not as confirming something you've already told them.
4. Never state or hint at what any of the actual definitions or connections are. Never mention or foreshadow the target concept's own content — only its name, as the destination the chain is building toward.
5. One single, coherent piece of free-text guidance — not a numbered list of separate questions, not one text box per item. It should read like "before we get to [target], write a short explanation that covers: what each of [A], [B], [C] means, and how they build on each other to lead into [target]" — natural prose, not a form.
6. Keep it concise and readable — a student should be able to read this once and know exactly what to write about, without it turning into a wall of text.

Output schema:
{ "questionText": string }`;

export interface ChainDiagnosticGradeResult {
  results: { correct: boolean; feedback: string | null }[];
}

// Grades the ONE free-text answer against every component at once, in the
// same order they were given. Each component gets its own verdict —
// "graded per-concept/per-link", not a single pass/fail for the whole
// answer.
export const CHAIN_DIAGNOSTIC_GRADE_PROMPT = `You are grading a UK GCSE/A-Level student's single free-text answer against a numbered list of separate things it's supposed to cover — some are "encoding" checks (did they correctly define a concept), some are "transfer" checks (did they correctly identify/apply that two concepts connect, even briefly), some are "integration" checks (did they actually explain the mechanism of WHY/HOW those two concepts connect, not just assert that they do).

You will be given the question the student was asked, the student's full answer, and a numbered list of components to check against — each with its real ground truth (never shown to the student, reference only for your grading).

Rules:
1. Output ONLY valid JSON, nothing else — an array with exactly one result per component, in the SAME order given.
2. Default toward "correct": true unless there's a genuine, substantive gap — do not penalize informal wording, incomplete phrasing, or a definition that captures the real idea without matching the reference text word-for-word.
3. An "encoding" component is correct if the student's definition of that concept captures its real meaning, in their own words.
4. A "transfer" component is correct if the student's answer shows they recognise/apply that the two named concepts actually connect — even a brief, correct statement that A relates to B here counts, this is a lighter recognition check, not a depth check.
5. An "integration" component is correct ONLY if the student actually explains the mechanism — HOW or WHY the earlier concept leads to the later one — not just that a connection exists. A student who states "A leads to B" with no explanation of the mechanism passes "transfer" for that link but FAILS "integration" for the same link.
6. If the student's answer never addresses a given component at all, mark it incorrect — silence on a required point is not evidence they know it.
7. "feedback" is a short, plain-language note written directly to the student for EVERY component (whether correct or not) — for a correct one, a brief confirmation; for an incorrect one, make clear WHAT was wrong or missing WITHOUT stating the actual correct definition/mechanism (point at the gap, don't fill it in).

Output schema:
{ "results": [ { "correct": boolean, "feedback": string } ] }`;

// Fired after a student is shown a specific wrong component and asked to
// self-report whether it was a silly slip/misread or a genuine gap, and
// says "slip" — gives exactly ONE focused, narrow re-ask of just that one
// component, distinct from the original combined question. Deliberately
// narrower/more direct than the original — a slip claim earns a clean shot
// at the SAME underlying content, not a second chance at guessing what was
// meant originally.
export const CHAIN_DIAGNOSTIC_SLIP_RETRY_QUESTION_PROMPT = `You are writing ONE focused, narrow question to re-test a single specific thing a student just got wrong, after they said it was a silly slip rather than a genuine gap. You will be given: what type of check this is (encoding = define a concept; transfer = identify that two concepts connect; integration = explain the mechanism connecting two concepts), the concept(s) involved, the real ground truth (reference only, never reveal it), and the student's original wrong answer plus the feedback they were given.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Ask directly and narrowly about just this one thing — no broader framing, no re-asking the whole original combined question.
3. Never state or hint at the actual correct definition/mechanism.
4. Keep it short — one direct question or instruction.

Output schema:
{ "questionText": string }`;

// Grades the narrow retry answer — same correctness bar as the matching
// component type in CHAIN_DIAGNOSTIC_GRADE_PROMPT's rules 3-6, applied to
// just the one component.
export const CHAIN_DIAGNOSTIC_SLIP_RETRY_GRADE_PROMPT = `You are grading a UK GCSE/A-Level student's answer to a single focused retry question. You will be given the check type (encoding/transfer/integration — same bar as: encoding = captures the concept's real meaning in their own words; transfer = correctly recognises/applies that the concepts connect, even briefly; integration = actually explains the mechanism, not just asserts a connection exists), the real ground truth (reference only), the question asked, and the student's answer.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Default toward "correct": true unless there's a genuine, substantive gap — do not penalize informal wording.
3. "feedback" is a short, plain-language note — a brief confirmation if correct, or a clear (but non-leaking) note of what's still missing if not.

Output schema:
{ "correct": boolean, "feedback": string }`;
