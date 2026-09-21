// Prompts for the redesigned knowledge-map "jump ahead" gate — see
// chainDiagnosticService.ts's buildPrerequisiteChains. Replaces the old
// single combined-essay question with one short, separately-answered
// question per component (a node's own encoding, or one link between two
// consecutive concepts in a chain) — the student gets a separate answer
// box for each, not one big text box to fill in.

export interface PerStepComponentInput {
  componentId: string;
  type: 'encoding' | 'link';
  label: string; // node label, or "A → B" for a link — display-safe
  groundTruth: string; // never shown to the student — reference only
}

// Generates every component's question in ONE call (cheaper, and keeps
// the whole set contextually consistent/non-repetitive) rather than one
// call per step. Each question is deliberately narrow now — testing ONE
// atomic thing, not a whole essay — since the columnar UI already breaks
// the chain up visually; the question itself doesn't need to do that work
// too.
export const PER_STEP_QUESTION_PROMPT = `You are writing short, separate questions for a student who is trying to jump straight to a target concept without having covered the concepts that lead up to it. You will be given the target concept's name (context only - never explain or hint at the target's own content) and an ordered list of components: some are "encoding" checks (one concept), some are "link" checks (how one concept connects to / leads into the next). Each component comes with its Reference (the ground truth, never shown to the student).

Rules:
1. Output ONLY valid JSON: exactly one question per component, in the SAME order given, each tagged with its own componentId.
2. Choose each question's FORMAT from what the component is. Open writing is used ONLY for a pure definition; everything else is interactive:
   - "spot_mistake" (the default): give "segments", 4 to 6 short sentences forming one connected explanation of the component, exactly ONE of which contains a plausible mistake of the kind a real student makes; "errorIndex" (0-based position of the wrong sentence) and "correction" (one or two sentences saying what is wrong and what is right).
   - "order": for a process, a sequence, a chain of cause and effect, and for most "link" components (how one concept leads into the next): give "items", 3 to 6 short steps (under 12 words each) in the CORRECT order.
   - "match": 3 to 5 "pairs" ({"left","right"}, every "right" distinct and fitting only its own "left") when the component is a small set of terms with definitions, cases with principles, or types with examples.
   - "free_text": ONLY for an "encoding" component that is a single term whose whole content is its definition. Ask the student to state the definition in their own words, naming the concept, and give a "markScheme" (one or two sentences).
3. Build every interactive question strictly from the Reference, so there is exactly one right answer. "questionText" is a short instruction that names the concept, for example "One sentence about photosynthesis is wrong. Tap it." Never state the answer in it.
4. Never mention or foreshadow the target concept's own content - only its name, if useful as context.
5. Keep every sentence short and specific to that one component.

Output schema:
{ "questions": [ { "componentId": string, "format": "spot_mistake" | "order" | "match" | "free_text", "questionText": string, "markScheme": string (free_text only), "segments": [string], "errorIndex": number, "correction": string, "items": [string], "pairs": [ { "left": string, "right": string } ] } ] }
Include only the fields that belong to the chosen format.`;

export interface PerStepGradeResult {
  componentId: string;
  correct: boolean;
  feedback: string;
  sillyMistake?: boolean;
  detail?: boolean[];   // interactive questions: which pieces were right
  reveal?: string;      // interactive questions: what was wrong, once found
}

// Grades every step's own separate answer in ONE call — each component
// was asked and answered independently (unlike the old combined-question
// design), so this grades a list of {question, answer} pairs against
// their own ground truth, not one shared answer against a component list.
// Reuses the exact same "sillyMistake" signal DAY1_CHECK_ANSWER_PROMPT
// already established (knowledgeMapAnswerCheckPrompt.ts) — a high bar,
// only set when a careless-slip reading is clearly more likely than a
// real gap, since it's what triggers the student's own retry checkbox.
export const PER_STEP_GRADE_PROMPT = `You are grading a UK GCSE/A-Level student's answers to several short, separate questions — some "encoding" checks (did they correctly explain a concept), some "link" checks (did they correctly explain HOW or WHY one concept leads to/connects with another, not just assert that it does).

You will be given a numbered list of components, each with its own question, its real ground truth (never shown to the student, reference only), and the student's own answer to that specific question.

Rules:
1. Output ONLY valid JSON, nothing else — an array with exactly one result per component, in the SAME order given, each tagged with its own componentId.
2. Default toward "correct": true unless there's a genuine, substantive gap against the ground truth — do not penalize informal wording or incomplete phrasing that still captures the real idea.
3. An "encoding" component is correct if the student's explanation captures the concept's real meaning, in their own words.
4. A "link" component is correct ONLY if the student actually explains the mechanism — HOW or WHY the first concept leads to the second — not just that a connection exists. Merely asserting "A leads to B" with no explanation of the mechanism is NOT correct.
5. If the student's answer to a component is blank or doesn't address it at all, mark it incorrect.
6. "feedback" is a short, plain-language note written directly to the student for EVERY component (whether correct or not) — a brief confirmation if correct, or a clear (but non-leaking — never stating the actual definition/mechanism) note of what's wrong or missing if not.
7. CRITICAL, only when "correct" is false — set "sillyMistake" true ONLY when the answer shows the student genuinely knows this but slipped on execution: a clear typo, an obvious word-swap, or answering a closely adjacent but wrong question. Set it false whenever the gap could plausibly be a real misunderstanding, even a partial one — this is a high bar, since "sillyMistake": true offers a retry rather than treating this as a genuine gap to actually re-teach. Omit entirely when "correct" is true.
8. Never put a literal double-quote character inside "feedback" — use single quotes instead.

Output schema:
{ "results": [ { "componentId": string, "correct": boolean, "feedback": string, "sillyMistake": boolean } ] }
"sillyMistake" ONLY when correct is false — omit entirely when correct is true.`;

// The one narrow re-ask after a student ticks "I think this was a silly
// mistake" on a specific wrong step — distinct from the original
// question, a clean second shot at the exact same underlying content.
export const PER_STEP_RETRY_QUESTION_PROMPT = `You are writing ONE focused, narrow question to re-test a single specific thing a student just got wrong, after they said it was a silly slip rather than a genuine gap. You will be given: what type of check this is (encoding = explain a concept; link = explain how one concept connects to/leads into another), the concept(s) involved, the real ground truth (reference only, never reveal it), and the student's original wrong answer plus the feedback they were given.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Ask directly and narrowly about just this one thing — no broader framing, no re-asking anything about the rest of the chain.
3. Never state or hint at the actual correct definition/mechanism.
4. Keep it short — one direct question.

Output schema:
{ "questionText": string }`;

// Grades the narrow retry answer — same correctness bar as
// PER_STEP_GRADE_PROMPT's rules 3-4, applied to just the one component.
// No "sillyMistake" field here — this IS the retry, there's nothing
// further to offer if it's still wrong.
export const PER_STEP_RETRY_GRADE_PROMPT = `You are grading a UK GCSE/A-Level student's answer to a single focused retry question. You will be given the check type (encoding = explain a concept, correct if their explanation captures its real meaning in their own words; link = explain how one concept connects to/leads into another, correct ONLY if they actually explain the mechanism, not just assert a connection exists), the real ground truth (reference only), the question asked, and the student's answer.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Default toward "correct": true unless there's a genuine, substantive gap — do not penalize informal wording.
3. "feedback" is a short, plain-language note — a brief confirmation if correct, or a clear (but non-leaking) note of what's still missing if not.
4. Never put a literal double-quote character inside "feedback" — use single quotes instead.

Output schema:
{ "correct": boolean, "feedback": string }`;
