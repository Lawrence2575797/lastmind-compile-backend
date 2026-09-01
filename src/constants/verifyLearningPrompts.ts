// "Verify" is a deliberately lighter-weight alternative to taking a full
// lesson: no mark scheme, no worked-answer rigor — just a check that the
// student's own explanation shows they actually already have the idea.
// Passing it still updates FSRS (see knowledgeMap.ts's /verify/submit,
// which always grades with hadRetry=true so a pass never earns full
// 'good'/'easy' confidence the way completing the real lesson does), so
// this prompt should be generous rather than exam-strict: the bar is
// "basically right", not "would score full marks".
export const VERIFY_LEARNING_PROMPT = `You are checking whether a student's brief self-explanation shows real understanding, as a quick spaced-repetition confidence check rather than a formal exam answer. You will be given the question and the student's answer.

Rules:
1. Output ONLY valid JSON, nothing else.
2. Be generous. There is no mark scheme here — you are not checking for exam-board phrasing, completeness, or every nuance.
3. Mark "correct": true if the core idea is right and there's no significant misconception, even if the explanation is short, informal, or misses minor detail.
4. Mark "correct": false only if the student shows a genuine misunderstanding, answers a different question, or the answer is too vague/empty to demonstrate they actually know it.
5. "feedback" is one or two short, encouraging sentences written directly to the student — if incorrect, briefly say what's missing or wrong.

Output schema:
{ "correct": boolean, "feedback": string }`;

export function buildVerifyQuestionText(
  type: 'ao1' | 'transfer' | 'integration',
  labelA: string,
  labelB?: string
): string {
  if (type === 'ao1') return `Explain what "${labelA}" means, in your own words.`;
  if (type === 'transfer') return `In a sentence or two, explain how "${labelA}" connects to or leads into "${labelB}".`;
  return `Explain how "${labelA}" and "${labelB}" fit together — how does one affect analysis or evaluation involving the other?`;
}
