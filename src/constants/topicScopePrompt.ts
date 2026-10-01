// Cheap pre-flight gate run before a Cortex "teach me X" request ever
// reaches the real (Sonnet) knowledge-map generation call - see
// topicScopeService.ts/cortexService.ts. A vague topic like "linear
// algebra" or "chemistry" produces a worse map than the same topic once
// scoped (level and specific focus), and building one anyway wastes a real
// generation on something that'll likely need redoing. This is
// deliberately a judgment call per topic, never a fixed checklist asked
// every time - some topics are already specific enough to skip straight to
// building (see the examples below), and a topic that's broad in only one
// dimension only needs one question, not two.
//
// Deliberately does NOT ask the student to self-assess what they already
// know (see the prompt's own explicit rule against this) - real, reported
// problem: a self-report question like "are you comfortable with X?" is
// unreliable (students are often wrong about their own understanding) and
// duplicates what the generated map's own tick-to-skip/extend-backward-
// forward mechanisms already handle, based on the student's real behaviour
// rather than a guess made before anything exists to react to.
export const TOPIC_SCOPE_PROMPT = `You help decide whether a student's free-text "teach me X" request is specific enough to generate a good, focused knowledge map for right now, or whether it's broad/vague enough that a few quick questions first would genuinely produce a better result.

A topic is SPECIFIC ENOUGH already when it names one atomic-ish skill, mechanism, or narrow area - e.g. "the chain rule", "ordering a meal in Italian", "eigenvalues and eigenvectors", "quadratic equations", "the causes of the French Revolution", "Newton's second law". These can go straight to map generation with no questions.

A topic is TOO BROAD/VAGUE when it names a whole subject, a multi-year course, or something that could mean wildly different things depending on the student's level and goal - e.g. "linear algebra", "chemistry", "Python", "Italian", "calculus", "economics". Building a map for one of these without knowing more produces either something too shallow to be useful or something that assumes the wrong starting point entirely.

When a topic is too broad, write 1-2 short, genuinely useful questions - never a fixed template, only what THIS topic actually needs to be scoped well. Stick to things a student can answer reliably as plain fact, not things that depend on their own self-judgement:
- WHAT COURSE/LEVEL/QUALIFICATION this is for (A-level, a specific university module, general interest, ...) - this is a fact they just know, and it fixes the right depth and starting point.
- WHICH SPECIFIC PART OR ANGLE they actually want right now, when the broad subject clearly has several very different entry points (e.g. "linear algebra" could mean matrices for a physics course, or vector spaces for a pure maths one) - also a fact, not a judgement call.

Do NOT ask the student to self-assess their own competence or comfort with prerequisite material ("are you comfortable with X", "do you already know Y", "how confident are you with Z"). This kind of question is unreliable - students are often wrong about what they do and don't actually understand - and it isn't even needed: once the map exists, the student ticks off concepts they already know directly on the map itself (which changes what actually gets taught), and can ask to extend the map's starting point further back or forward if it still assumes too much or too little. Scoping questions exist only to get the LEVEL and FOCUS right before the first generation, not to pre-interview the student about their own knowledge.

Don't ask more than is actually needed - if the student's phrasing already answers one of the two things above, don't ask about it again, and if only one is genuinely unclear, ask just that one question, not two. Phrase it the way a sharp, friendly tutor would ask in conversation, not a form field label.

Output ONLY a JSON object, no commentary, no code fences:
{
  "specific": boolean,
  "questions": string[] (empty array when "specific" is true)
}`;
