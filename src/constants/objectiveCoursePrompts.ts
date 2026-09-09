// Prompts for the goal-driven "crash course" feature (see
// objectiveCourseService.ts) - a student picks a language and states a
// real goal + daily time budget instead of committing to the whole
// subject's knowledge map.

export const CLASSIFY_SUBJECT_TITLE_PROMPT = `You are deciding whether a short, freely-typed subject title names a LANGUAGE a student wants to learn to speak/read/write (e.g. "Spanish", "Italian", "French", "Mandarin", "BSL") as opposed to any other kind of subject, course, or topic (e.g. "Maths", "Economics", "Guitar", "Python programming", "History of Rome").

Judge the title alone, on ordinary meaning - do not overthink edge cases. A title that names a natural human language is "isLanguage": true. Anything else, including a subject that merely MENTIONS a language in passing or a programming language, is false.

Return ONLY valid JSON: { "isLanguage": true | false }`;

export const OBJECTIVE_COURSE_PLAN_PROMPT = `You are selecting the minimal, real subset of a language's knowledge-map graph a student needs to achieve ONE stated conversational goal within a self-reported daily time budget - a bounded "crash course" through an otherwise much larger subject, not the whole language.

You will be given the subject name, the student's own free-text answer (which mixes their goal and how many minutes/day they can study, in no fixed order or format), and the FULL list of available knowledge-map nodes for this subject as "id | subtopic | label" lines.

## Rules

1. **Extract the student's real goal and daily minutes from their free text.** "goal" should be a short, clear restatement of what they want to be able to do (e.g. "order food and drinks at a restaurant"). "minutesPerDay" is the number of minutes/day they stated - if they gave a range, use the midpoint; if they didn't give one at all, use 15 as a sensible default.

2. **Select every node genuinely needed for the goal, from BOTH sides of the exchange.** A real conversation is not one-way: a student ordering at a restaurant also needs to understand what a waiter is likely to say back (prices, "anything else?", checking an order, offering the bill) - so deliberately include comprehension-side vocabulary/grammar for the other party's plausible responses, not just the student's own production vocabulary. Be generous enough to make the goal genuinely achievable, but do not add nodes that serve some other, unstated goal - stay scoped to what this specific goal actually requires.

3. **Select by node id only, from the exact ids given - never invent an id.** You do not need to include a node's own prerequisites yourself; the caller re-adds the full prerequisite chain automatically afterward, so focus purely on which nodes are directly relevant to the goal, not on completeness of the dependency graph.

4. **If the subject's node list has nothing genuinely relevant to the stated goal** (the goal doesn't match anything in this language, or the list is empty), return an empty "nodeIds" array rather than forcing an unrelated selection.

## Output format

Return ONLY valid JSON:
{ "goal": "short restatement of the goal", "minutesPerDay": number, "nodeIds": ["id1", "id2", ...] }`;
