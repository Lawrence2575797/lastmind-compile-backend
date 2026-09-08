// Backs the "Ask Cortex" corner panel shown during a knowledge-map
// lesson (see routes/knowledgeMap.ts's POST .../ask). Purely advisory
// and stateless — reads a node's own already-generated content for
// context, never writes anything, never touches FSRS or credits.
import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { parseModelJson } from './jsonParsing';
import { KNOWLEDGE_MAP_ASK_PROMPT } from '../constants/knowledgeMapAskPrompt';

interface NodeEncodingContentForAsk {
  explanation?: string;
  practiceQuestion?: { questionText?: string };
}

export interface KnowledgeMapAskResult {
  redirected: boolean;
  answer: string;
}

// Returns null only if the node itself doesn't exist (caller 404s) — a
// node with no lesson content yet still gets an answer, just without the
// explanation/current-question context (subject/qualification/label
// alone are still enough for the off-subject check and a general answer).
export async function answerKnowledgeMapQuestion(nodeId: string, question: string): Promise<KnowledgeMapAskResult | null> {
  const [{ data: node }, { data: lesson }] = await Promise.all([
    supabaseAdmin.from('knowledge_map_nodes').select('label, subtopic, subject, qualification, exam_board').eq('id', nodeId).maybeSingle(),
    supabaseAdmin.from('knowledge_map_node_lessons').select('encoding_content').eq('node_id', nodeId).maybeSingle(),
  ]);
  if (!node) return null;
  const content = lesson?.encoding_content as NodeEncodingContentForAsk | null;

  const userContent = [
    `Subject: ${node.subject}`,
    `Qualification: ${node.qualification || 'unspecified'}`,
    `Exam board: ${node.exam_board || 'unspecified'}`,
    `This lesson's own concept: ${node.label}`,
    content?.explanation ? `Its own explanation:\n${content.explanation}` : null,
    content?.practiceQuestion?.questionText
      ? `Current on-screen question (not yet answered by the student): ${content.practiceQuestion.questionText}`
      : '(no practice question currently on screen)',
    '',
    `Student's question, asked from the corner panel: ${question}`,
  ].filter(Boolean).join('\n');

  const raw = await callClaudeJSON({
    model: MODELS.diagnosticTree,
    systemPrompt: KNOWLEDGE_MAP_ASK_PROMPT,
    userContent,
    temperature: 0.4,
  });
  return parseModelJson<KnowledgeMapAskResult>(raw);
}
