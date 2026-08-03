export const MULTI_QUESTION_GENERATION_PROMPT = `You are decomposing a lesson into a set of diagnostic retrieval questions, for a UK GCSE/A-Level student.

You will be given a subject, topic, lesson name, and (optionally) the student's actual notes for this lesson.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Decide the NUMBER of questions yourself, based on how many genuinely distinct concepts the lesson actually covers — a dense lesson with several distinct ideas needs more questions than a lesson covering one narrow idea. Do not pad the count artificially, and do not under-cover a genuinely dense lesson.
3. Each question must require genuinely applying or explaining its concept — not just restating a definition.
4. Use the student's own notes (if provided) to ground the questions in what was actually taught, rather than a generic textbook version of the topic.
5. Give each question a short, precise concept label (snake_case-friendly), since this is used to track the student's progress on that specific concept over time.

Output schema:
{
  "questions": [
    { "conceptLabel": string, "question": string }
  ]
}`;

export const CHECK_ANSWER_AND_SLIP_PROMPT = `You are marking a student's free-text answer to a diagnostic question, and — only if it's wrong — judging whether the error looks like a careless slip.

A careless slip means: the underlying understanding is clearly intact, but there's an isolated, mechanical error (a small arithmetic mistake, a sign error, a clear one-off lapse) — NOT a genuine gap in understanding the concept itself.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Be reasonably generous with phrasing, but genuinely strict about whether real understanding is present.
3. Only set "looksLikeSlip" to true if you'd be genuinely surprised if the student got it wrong again on a re-attempt — this should be a real, considered judgment, not a default guess.

Output schema:
{ "correct": boolean, "looksLikeSlip": boolean, "reasoning": string }`;

export const RECOGNITION_QUESTION_PROMPT = `You are writing a multiple-choice RECOGNITION question testing whether a student can identify the correct answer when shown options — used specifically to distinguish "the knowledge isn't there at all" (fails this too) from "it's there but not freely retrievable" (passes this).

Rules:
1. Output ONLY valid JSON, nothing else.
2. Exactly 4 options, only one correct.
3. Make the 3 incorrect options genuinely plausible — common misconceptions or near-misses, not obvious filler.
4. Do not make the correct answer noticeably longer or more detailed than the distractors.

Output schema:
{ "question": string, "options": [string, string, string, string], "correctOptionIndex": number }`;

export const WM_RELAXATION_PROMPT = `You are simplifying a diagnostic question that a student just got wrong, to test whether the failure was caused by working-memory overload rather than a genuine gap in the underlying concept.

Simplify by doing ONE OR MORE of: reducing how many things must be held in mind at once, simplifying the wording, breaking a multi-part question into a smaller single part.

Do NOT simplify away the actual concept being tested — the simplified version must still genuinely test the same concept, just with less simultaneous load.

Output ONLY valid JSON, nothing else:
{ "simplifiedQuestion": string }`;

export const HINT_CUE_PROMPT = `You are writing a single, gentle hint for a student who has already shown (via a recognition test) that they know this concept, but couldn't recall it unprompted. This is testing whether a small generic nudge is enough to bring it back — if it is, that points to ordinary forgetting (decay) rather than confusion with something else.

The hint should NOT give away the answer — just a small nudge (a category, a first letter, a related but distinct fact) that would help genuine recall without doing the work for them.

Output ONLY valid JSON, nothing else:
{ "hint": string }`;

export const CONTRASTIVE_CUE_PROMPT = `You are writing ONE question that explicitly distinguishes a target concept from the concept it is most commonly confused with, for a UK GCSE/A-Level student. This is testing whether confusion with a similar concept (interference) is the actual cause of a retrieval failure, rather than plain forgetting.

You will be given the target concept. Identify the single concept it is most commonly confused with in real student errors, and write a question that requires correctly distinguishing between the two.

Output ONLY valid JSON, nothing else:
{ "confusedWith": string, "question": string }`;

export const CORRECTION_PROMPT = `You are writing a short correction for a UK GCSE/A-Level student, based on a specific diagnosed cause of their error. Write directly to the student, second person, encouraging but honest.

You will be given the concept and the diagnosis, which is exactly one of:
- "encoding": never properly understood at all. Write a clear, fresh explanation of the concept.
- "wm_overload": understood in pieces, but holding it all at once (or the full chain, for multi-step concepts) overwhelmed them. Do NOT re-explain the concept — write guidance on breaking it into smaller steps and practicing the combination gradually.
- "decay": genuinely known (confirmed via a hint bringing it back), it's just gone a bit rusty from time. Write brief encouragement that this is normal and just needs a bit more retrieval practice — do not re-explain the concept.
- "interference": known but getting mixed up with a specific similar concept. Write a short, explicit contrast between the two — do not just re-explain the target concept alone.
- "schedule_miscalibrated": reviewed exactly on schedule and still failed — the system's own timing was wrong for this student, not their fault. Briefly and honestly acknowledge this, and note this concept will now be reviewed somewhat sooner.
- "transfer": knows the individual prerequisites, and succeeded once told which to combine — the gap is applying them together in a new context, not knowing them. Write guidance on practicing the same combination in varied framings.
- "integration": knows the individual prerequisites but still couldn't combine them even when told which to use. Write guidance on practicing the combination itself, scaffolded, building up gradually.
- "global_chain_failure": every individual step is genuinely solid, but the full chain is too long to hold at once. Write guidance on practicing shorter sub-chains until fluent, then gradually extending.

Output ONLY valid JSON, nothing else:
{ "correction": string }`;

export const LOCALIZATION_CHECK_PROMPT = `You are writing ONE quick check question testing whether a student knows a specific prerequisite concept — used to localize exactly where a chain of reasoning broke down, not as a full diagnostic in itself.

Keep it short and direct — this just needs a clear pass/fail signal on this one prerequisite.

Output ONLY valid JSON, nothing else:
{ "question": string }`;

export const CUED_COMBINATION_PROMPT = `You are re-asking a question the student already got wrong, but this time explicitly telling them which underlying ideas to combine — used to test whether the failure was about COMBINING known ideas (rather than not knowing the ideas themselves, which has already been ruled out).

You will be given the original question and the names of the prerequisite concepts to explicitly cue.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Keep the underlying question the same — just make it explicit which concepts need combining, as a direct hint, not a rewrite of the whole question.

Output ONLY valid JSON, nothing else:
{ "cuedQuestion": string }`;
