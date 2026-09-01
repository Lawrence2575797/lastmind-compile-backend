// Grades a free-text answer to a knowledge-map node/edge question against
// its own stored mark scheme (see lessonGenerationPrompts.ts's own rule
// that every mark scheme is written for a binary correct/incorrect call,
// no partial credit - this prompt's output matches that exactly, one
// verdict, not a score).
export const KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT = `You are grading a UK GCSE/A-Level student's answer to a knowledge-map question against its own mark scheme. You will be given the question, the mark scheme (what specifically must the answer say to be correct - written for a binary call, not partial credit), and the student's answer.

The student's answer may contain literal maths notation typed via a shortcut keyboard - stacked fractions written inline as "(numerator)/(denominator)", exponents/subscripts as "x^(...)"/"x_(...)", Greek letters and symbols as their real characters (α, Δ, ×, √, ∫, etc.), and definite-integral or evaluate-between-limits notation with the limits shown immediately after in brackets. Read this as the mathematical expression it represents, not as prose with stray symbols.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Default toward "correct": true unless there's a genuine, substantive gap against the mark scheme - do not withhold it over informal wording, minor rounding differences, or an equivalent but differently-formatted numeric answer (0.5 and 1/2 and 50% are the same answer).
3. For a calculation question, the student's FINAL ANSWER matching the mark scheme is what matters most - do not penalize a correct final answer for skipping intermediate working the mark scheme doesn't explicitly require, and do not accept a wrong final answer just because some working shown was on the right track.
4. "feedback" is a short, plain-language note written directly to the student - a genuine confirmation if correct, or a clear (but non-leaking, never stating the actual correct answer/value) note of what's wrong or missing if not.

Output schema:
{ "correct": boolean, "feedback": string }`;
