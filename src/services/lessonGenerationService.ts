// On-demand generation for knowledge-map lesson content. Same one-time-
// generation contract scripts/generate_lesson_content.js established for
// the offline Batches pipeline (a node/edge's lesson is generated exactly
// once, then served identically to every student forever after) - this
// reuses the exact same prompts and per-node/edge input shape, just
// triggered by live demand (the first request that finds no row yet)
// instead of a batch run over a whole subject ahead of time. See
// routes/knowledgeMap.ts's GET node/edge lesson routes, the only callers.
import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON } from './claudeClient';
import { parseModelJson, stripCodeFences } from './jsonParsing';
import { KNOWLEDGE_MAP_ENCODING_LESSON_PROMPT, KNOWLEDGE_MAP_EDGE_LESSON_PROMPT } from '../constants/lessonGenerationPrompts';

// Same model choice as the offline pipeline (generate_lesson_content.js's
// LESSON_MODEL) - a structured writing task against an explicit spec, not
// a judgment call, so no need for a bigger tier. Thinking is disabled
// automatically for this model by claudeClient's own THINKS_BY_DEFAULT_MODELS
// handling - no per-call opt-in needed.
const LESSON_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const MAX_TOKENS = 16000;

// jsonParsing.ts's own repairs (code-fence stripping, extracting the
// outermost {...} span, fixing unescaped internal quotes) don't cover
// this exact prompt's own reproducible failure mode: a response missing
// PRECISELY its final closing brace/bracket, otherwise well-formed -
// confirmed live during the real Maths knowledge-map generation run via
// byte-level brace counting, not genuine truncation (see
// generate_knowledge_map.js's own parseJsonWithRepair, which this
// mirrors for the same reason). That pipeline could inspect a failure and
// retry by hand; this is now a live, single-shot, user-facing path, so
// it's worth this last-resort repair before giving up outright.
function parseWithClosingBraceRepair<T>(raw: string): T {
  try {
    return parseModelJson<T>(raw);
  } catch (firstErr) {
    const text = stripCodeFences(raw);
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    for (const ch of text) {
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') {
        if (stack[stack.length - 1] === ch) stack.pop();
      }
    }
    if (inString || !stack.length) throw firstErr;
    return JSON.parse(text + stack.reverse().join('')) as T;
  }
}

interface NodeRow {
  id: string;
  label: string;
  subtopic: string | null;
  subject: string;
  qualification: string;
  exam_board: string;
}

// Generates and caches one node's encoding lesson. Returns null only if
// the node itself doesn't exist (caller 404s); a generation failure
// throws, same as every other Claude call in this app - there is
// deliberately no silent fallback content for a real lesson.
export async function generateAndCacheNodeLesson(nodeId: string): Promise<unknown | null> {
  const { data: node, error: nodeError } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('id, label, subtopic, subject, qualification, exam_board')
    .eq('id', nodeId)
    .maybeSingle();
  if (nodeError) throw nodeError;
  if (!node) return null;
  const typedNode = node as NodeRow;

  const [{ data: outEdges }, { data: inEdges }] = await Promise.all([
    supabaseAdmin.from('knowledge_map_edges').select('to_node_id').eq('from_node_id', nodeId),
    supabaseAdmin.from('knowledge_map_edges').select('from_node_id').eq('to_node_id', nodeId),
  ]);
  const leadsToIds = (outEdges || []).map((e) => e.to_node_id as string);
  const leadsFromIds = (inEdges || []).map((e) => e.from_node_id as string);
  const neighborIds = Array.from(new Set([...leadsToIds, ...leadsFromIds]));
  const { data: neighborRows } = neighborIds.length
    ? await supabaseAdmin.from('knowledge_map_nodes').select('id, label').in('id', neighborIds)
    : { data: [] as { id: string; label: string }[] };
  const labelById = new Map((neighborRows || []).map((n) => [n.id as string, n.label as string]));
  const leadsToLabels = leadsToIds.map((id) => labelById.get(id)).filter(Boolean);
  const leadsFromLabels = leadsFromIds.map((id) => labelById.get(id)).filter(Boolean);

  const userContent = [
    `Subject: ${typedNode.subject}`,
    `Qualification: ${typedNode.qualification}`,
    `Exam board: ${typedNode.exam_board}`,
    `Subtopic: ${typedNode.subtopic || ''}`,
    `Concept to teach: ${typedNode.label}`,
    `Concepts this leads to (do not explain or foreshadow these - see rule 3): ${JSON.stringify(leadsToLabels)}`,
    `This node's own direct prerequisites, already taught immediately before this one (ground and build forward from these - see rule 1a): ${JSON.stringify(leadsFromLabels)}`,
  ].join('\n');

  const raw = await callClaudeJSON({
    model: LESSON_MODEL,
    systemPrompt: KNOWLEDGE_MAP_ENCODING_LESSON_PROMPT,
    userContent,
    maxTokens: MAX_TOKENS,
  });
  const encodingContent = parseWithClosingBraceRepair<unknown>(raw);

  // Upsert (not a plain insert) - node_id is unique-constrained, so two
  // students racing on the same brand-new node both generate but only one
  // write wins, harmlessly (either draft is equally valid going forward).
  const { error: upsertError } = await supabaseAdmin
    .from('knowledge_map_node_lessons')
    .upsert({ node_id: nodeId, encoding_content: encodingContent }, { onConflict: 'node_id' });
  if (upsertError) throw upsertError;

  return encodingContent;
}

interface EdgeLessonResult {
  linkTeaching: string;
  transferQuestion: unknown;
  integrationQuestion: unknown;
}

// Generates and caches one edge's link-teaching/transfer/integration
// content. Returns null if the edge doesn't exist OR either endpoint
// isn't encoded yet - the prompt needs both explanations as input, and
// structurally a student can't reach this point without both already
// being encoded (findMissingEncoding gates it), but this is checked
// directly rather than trusted blindly.
export async function generateAndCacheEdgeLesson(fromNodeId: string, toNodeId: string): Promise<EdgeLessonResult | null> {
  const { data: edgeRow, error: edgeError } = await supabaseAdmin
    .from('knowledge_map_edges')
    .select('id')
    .eq('from_node_id', fromNodeId)
    .eq('to_node_id', toNodeId)
    .maybeSingle();
  if (edgeError) throw edgeError;
  if (!edgeRow) return null;

  const [{ data: fromNode }, { data: toNode }, { data: fromLesson }, { data: toLesson }] = await Promise.all([
    supabaseAdmin.from('knowledge_map_nodes').select('label, subtopic, subject, qualification, exam_board').eq('id', fromNodeId).maybeSingle(),
    supabaseAdmin.from('knowledge_map_nodes').select('label, subtopic, subject, qualification, exam_board').eq('id', toNodeId).maybeSingle(),
    supabaseAdmin.from('knowledge_map_node_lessons').select('encoding_content').eq('node_id', fromNodeId).maybeSingle(),
    supabaseAdmin.from('knowledge_map_node_lessons').select('encoding_content').eq('node_id', toNodeId).maybeSingle(),
  ]);
  if (!fromNode || !toNode) return null;
  const fromExplanation = (fromLesson?.encoding_content as { explanation?: string } | null)?.explanation;
  const toExplanation = (toLesson?.encoding_content as { explanation?: string } | null)?.explanation;
  if (!fromExplanation || !toExplanation) return null;

  const typedTo = toNode as NodeRow;
  const userContent = [
    `Subject: ${typedTo.subject}`,
    `Qualification: ${typedTo.qualification}`,
    `Exam board: ${typedTo.exam_board}`,
    `Subtopic: ${typedTo.subtopic || ''}`,
    '',
    `Concept A: ${fromNode.label}`,
    `A's explanation: ${fromExplanation}`,
    '',
    `Concept B: ${toNode.label}`,
    `B's explanation: ${toExplanation}`,
  ].join('\n');

  const raw = await callClaudeJSON({
    model: LESSON_MODEL,
    systemPrompt: KNOWLEDGE_MAP_EDGE_LESSON_PROMPT,
    userContent,
    maxTokens: MAX_TOKENS,
  });
  const parsed = parseWithClosingBraceRepair<EdgeLessonResult>(raw);

  const { error: upsertError } = await supabaseAdmin
    .from('knowledge_map_edge_lessons')
    .upsert(
      {
        edge_id: edgeRow.id,
        link_teaching_content: parsed.linkTeaching,
        transfer_question: parsed.transferQuestion,
        integration_question: parsed.integrationQuestion,
      },
      { onConflict: 'edge_id' }
    );
  if (upsertError) throw upsertError;

  return parsed;
}
