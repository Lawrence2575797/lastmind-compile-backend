// Prompts for the first-time "encoding" lesson (see encodingLessonService.ts)
// — a genuinely different pedagogical shape from the retrieval chain-lesson
// engine in spacedLessonEngine.ts: a novelty hook, then a Socratic walk
// FORWARD through the concept's dependency chain (leaf prerequisites first,
// building toward the new target concept last), asking the student to
// derive each derivable step themselves rather than being told it.

export const ENCODING_LESSON_BATCH_PROMPT = `You are designing a first-time "encoding" lesson for a UK GCSE/A-Level student who has never been taught this concept before. You will be given the subject, the exact topic and target concept name (the specific lesson this is — every step you write must build toward THIS exact concept, not a related or more general one), and the concept's full prerequisite chain, already ordered FORWARD — the most foundational prerequisite first, building step by step toward the new target concept, which is always the LAST node in the chain. Each node is marked "derivable": true or false.

Your job is to write the actual lesson content, as a single JSON response covering the whole chain — every step below is presented to the student in this same forward order, one at a time, each building on the ones before it.

Structure:
1. A "hookFact" — one genuinely interesting, novel fact related to the target concept specifically (not a generic fact about the wider subject), written to spark curiosity before the lesson begins. Not a question, not part of the chain itself — just an engaging opener.
2. One "step" per node in the chain, in the SAME forward order they're given to you:
   - The FIRST node in the chain always gets "type": "scene" — a relatable, fairly concrete example or scenario that sets the scene for this node's content, something the student can picture or connect to their own experience. This is an invitation to engage, not a rigorous test, and it's what begins the chain.
   - Every LATER node marked "derivable": true gets "type": "derive" — a prompt that asks the student to reason out or derive THIS node's content themselves, building on everything established in the steps before it. It must NOT give the answer away or state the content directly — it should give the student enough to work it out using what they already know from earlier in the chain (and general prior knowledge), not hand it to them.
   - Every LATER node marked "derivable": false gets "type": "explain" — direct, clear explanatory text that actually teaches this specific piece of content plainly. This is not a question — there's nothing to derive, so just explain it well, in a way that connects to the steps around it.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Exactly one step per node, in the exact same order as the chain you were given.
3. Every "derive" and "scene" step must be phrased as something the student actively responds to — never give away the content itself.
4. Every "explain" step must actually explain the content clearly and completely — the student has no way to derive it, so don't be vague or make them guess.
5. Keep each step focused on its own node — don't bundle multiple nodes into one step.
6. Keep every "hookFact" and every step's "text" tight — 1 to 3 sentences each, not a paragraph. This is a JSON response covering an entire lesson at once, so length discipline on every field matters.

Output schema:
{
  "hookFact": string,
  "steps": [
    { "nodeId": string, "type": "scene" | "derive" | "explain", "text": string }
  ]
}`;

export const ENCODING_ANSWER_CHECK_PROMPT = `You are grading a UK GCSE/A-Level student's free-text answer during a first-time "encoding" lesson, where they were asked to derive or engage with one step of a concept's reasoning chain.

The standard: imagine explaining this to a genuinely bright five-year-old who knows nothing about the subject yet. That doesn't mean childish language — it means NO step in the reasoning can be skipped, no matter how small, and no jargon or technical term can be used without being explained in the same answer. An answer that uses the right terminology but skips the "why" or "how" between steps, or drops in an unexplained term, does not pass. An answer that reaches the right idea through clear, complete, unbroken reasoning does pass, even if the wording is informal.

You will be given the concept/step this answer is about, the prompt the student was responding to, and their answer.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Set "correct" to true only if every step of the reasoning is present and nothing is left unexplained.
3. If "correct" is false, set "feedback" to a short, specific pointer at what's missing or unexplained — enough to guide them toward fixing it themselves, but do NOT state the missing content or the correct answer outright.
4. If "correct" is true, set "feedback" to null.

Output schema:
{ "correct": boolean, "feedback": string | null }`;

export const ENCODING_DRAFT_CHECK_PROMPT = `You are watching a UK GCSE/A-Level student type their answer, in real time, to a question asking them to derive or explain one step of a concept's reasoning chain. Your job is to spot phrases in their CURRENT, still-in-progress draft that use unexplained jargon or skip a step in the reasoning — the same "could a five-year-old follow every step" standard used for final grading, applied early so the student can fix it before submitting.

You will be given the concept/step, the prompt they're responding to, and their current draft text.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Only flag phrases that are GENUINELY a skipped step or unexplained term — don't flag stylistic or minor issues, and don't flag anything if the draft is too short to judge yet.
3. Each "snippet" MUST be copied verbatim, character-for-character, from the draft you were given — it will be located by exact text match, so it must exist exactly as given.
4. Each "hint" must point at what's missing WITHOUT stating the missing content or the correct answer.
5. Return at most 3 flags, prioritizing the most important gaps if there are more than 3.
6. If there's nothing worth flagging yet, return an empty array.

Output schema:
{ "flags": [ { "snippet": string, "hint": string } ] }`;
