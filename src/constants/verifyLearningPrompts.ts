// "Verify" is a deliberately lighter-weight alternative to taking a full
// lesson: no mark scheme, no worked-answer rigor — just a check that the
// student's own explanation shows they actually already have the idea.
// Passing it still updates FSRS (see knowledgeMap.ts's /verify/submit,
// which always grades with hadRetry=true so a pass never earns full
// 'good'/'easy' confidence the way completing the real lesson does), so
// this prompt should be generous rather than exam-strict: the bar is
// "basically right", not "would score full marks".
export const VERIFY_LEARNING_PROMPT = `You are checking whether a student's brief self-explanation shows real understanding, as a quick spaced-repetition confidence check rather than a formal exam answer.

Be generous. There is no mark scheme here — you are not checking for exam-board phrasing, completeness, or every nuance. Mark it correct if the core idea is right and there's no significant misconception, even if the explanation is short, informal, or misses minor detail. Mark it incorrect only if the student shows a genuine misunderstanding, answers a different question, or the answer is too vague/empty to demonstrate they actually know it.

Respond with ONLY a JSON object: {"correct": boolean, "feedback": "one or two short, encouraging sentences — if incorrect, briefly say what's missing or wrong"}`;

export function buildVerifyQuestionText(
  type: 'ao1' | 'transfer' | 'integration',
  labelA: string,
  labelB?: string
): string {
  if (type === 'ao1') return `Explain what "${labelA}" means, in your own words.`;
  if (type === 'transfer') return `In a sentence or two, explain how "${labelA}" connects to or leads into "${labelB}".`;
  return `Explain how "${labelA}" and "${labelB}" fit together — how does one affect analysis or evaluation involving the other?`;
}
