// Cheap (Haiku) pre-flight gate run before a "teach me X" request reaches
// the real (Sonnet) knowledge-map generation - see cortexService.ts. Fails
// open: any error, or a "not specific" verdict with no usable questions,
// just proceeds to build the map directly, same as before this existed -
// this gate should never be the reason a student can't start learning
// something.
import { callClaudeJSON, MODELS } from './claudeClient';
import { parseModelJson } from './jsonParsing';
import { TOPIC_SCOPE_PROMPT } from '../constants/topicScopePrompt';

export interface TopicScopeResult {
  specific: boolean;
  questions: string[];
}

export async function checkTopicScope(topic: string, userId: string): Promise<TopicScopeResult> {
  try {
    const raw = await callClaudeJSON({
      model: MODELS.simpleQuestion,
      systemPrompt: TOPIC_SCOPE_PROMPT,
      userContent: `Topic: ${topic}`,
      maxTokens: 400,
      temperature: 0.4,
      userId,
      meteredReason: 'topic-scope-check',
    });
    const parsed = parseModelJson<{ specific?: unknown; questions?: unknown }>(raw);
    const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
      .filter((q): q is string => typeof q === 'string' && !!q.trim())
      .slice(0, 3);
    const specific = parsed.specific === true || !questions.length;
    return { specific, questions: specific ? [] : questions };
  } catch (err) {
    console.error('Topic scope check failed - proceeding to build the map directly.', err);
    return { specific: true, questions: [] };
  }
}
