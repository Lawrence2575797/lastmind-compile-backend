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
import { parseModelJson, stripCodeFences, escapeRawControlCharsInStrings } from './jsonParsing';
import { KNOWLEDGE_MAP_ENCODING_LESSON_PROMPT, KNOWLEDGE_MAP_EDGE_LESSON_PROMPT } from '../constants/lessonGenerationPrompts';
import { getNodeNoteBaseline, getEdgeNoteBaseline } from './knowledgeMapNotesService';
import { generateDiagramSpecForConcept } from './diagramSpecGenerationService';

// Same model choice as the offline pipeline (generate_lesson_content.js's
// LESSON_MODEL) - a structured writing task against an explicit spec, not
// a judgment call, so no need for a bigger tier. Thinking is disabled
// automatically for this model by claudeClient's own modelThinksByDefault
// handling (base-name matched, so this still works even if CLAUDE_MODEL is
// overridden to a dated snapshot rather than the bare alias) - no per-call
// opt-in needed.
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
    // parseModelJson already tries escapeRawControlCharsInStrings on its
    // own, but only against an as-is (correctly-balanced) string - applied
    // again here, against the bracket-repaired text below, to also cover
    // the compound case (both a raw control character AND a missing
    // closing brace in the same response).
    const text = escapeRawControlCharsInStrings(stripCodeFences(raw));
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
export async function generateAndCacheNodeLesson(nodeId: string, userId: string): Promise<unknown | null> {
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

  // Diagram-spec classification only needs the concept's own label (see
  // generateDiagramSpecForConcept's own comment - it doesn't read this
  // lesson's explanation at all), so it runs alongside the main lesson call
  // rather than after it - a genuinely independent, much smaller (2000 vs
  // 16000 max_tokens) call, so this adds no real latency to the lesson the
  // student is actually waiting on. Economics-only - the curve palette this
  // grades against is Economics-specific (see diagramSpecGenerationService.ts).
  // Never lets a diagram failure block the lesson itself: awaited via
  // Promise.allSettled, not Promise.all.
  const wantsDiagramSpec = typedNode.subject === 'Economics';
  const [lessonResult, diagramResult] = await Promise.allSettled([
    callClaudeJSON({
      model: LESSON_MODEL,
      systemPrompt: KNOWLEDGE_MAP_ENCODING_LESSON_PROMPT,
      userContent,
      maxTokens: MAX_TOKENS,
      // ~1,862 tokens, well over Sonnet's 1024-token cache minimum, and
      // byte-identical across every node/subject/student - exactly the
      // "large, fixed prompt reused verbatim" case cacheSystemPrompt exists
      // for (see claudeClient.ts's own comment). Wasn't set before; every
      // fresh generation was paying full input-token price on this prompt
      // for no reason.
      cacheSystemPrompt: true,
      userId,
      meteredReason: 'knowledge-map-v2-node-lesson',
    }),
    wantsDiagramSpec ? generateDiagramSpecForConcept(typedNode.label, userId) : Promise.resolve(null),
  ]);
  if (lessonResult.status === 'rejected') throw lessonResult.reason;
  const raw = lessonResult.value;
  // Logged, not thrown - a diagram is additive to a lesson that's otherwise
  // complete without one, never worth failing the whole generation over.
  if (diagramResult.status === 'rejected') {
    console.error(`LastMind: diagram spec generation failed for "${typedNode.label}" (${nodeId}).`, diagramResult.reason);
  }
  const diagramSpec = diagramResult.status === 'fulfilled' ? diagramResult.value : null;

  let encodingContent: unknown;
  try {
    encodingContent = parseWithClosingBraceRepair<unknown>(raw);
  } catch (err) {
    // Logged with enough to actually diagnose a live failure from Render's
    // own logs (no other way to see this - this route is live/single-shot,
    // unlike the offline batch pipeline's own debug-file dump) without
    // ever putting the raw model output in the student-facing error.
    console.error(`LastMind: node lesson generation failed to parse for "${typedNode.label}" (${nodeId}).`, { rawLength: raw.length, rawSnippet: raw.slice(0, 300) }, err);
    throw err;
  }
  if (diagramSpec) {
    const typedContent = encodingContent as { practiceQuestion?: Record<string, unknown> };
    if (typedContent.practiceQuestion) typedContent.practiceQuestion.diagramSpec = diagramSpec;
  }

  // Upsert (not a plain insert) - node_id is unique-constrained, so two
  // students racing on the same brand-new node both generate but only one
  // write wins, harmlessly (either draft is equally valid going forward).
  const { error: upsertError } = await supabaseAdmin
    .from('knowledge_map_node_lessons')
    .upsert({ node_id: nodeId, encoding_content: encodingContent }, { onConflict: 'node_id' });
  if (upsertError) throw upsertError;

  // Pre-warms the compiled note (a free text filter, not an AI call - see
  // knowledgeMapNotesService.ts's own top comment) the moment this lesson
  // exists, rather than waiting for a student to first open the Notes
  // page. Fire-and-forget: this must never add latency to the lesson the
  // student generating it is actually waiting on.
  getNodeNoteBaseline(nodeId).catch((err) => console.error(`LastMind: failed to pre-warm the compiled note for node ${nodeId}.`, err));

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
export async function generateAndCacheEdgeLesson(fromNodeId: string, toNodeId: string, userId: string): Promise<EdgeLessonResult | null> {
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
    // No cacheSystemPrompt here, deliberately - this prompt is ~873
    // tokens, under Sonnet's 1024-token cache minimum, so a cache_control
    // marker would silently do nothing (see claudeClient.ts's own
    // comment) - unlike the node lesson prompt above.
    userId,
    meteredReason: 'knowledge-map-v2-edge-lesson',
  });
  let parsed: EdgeLessonResult;
  try {
    parsed = parseWithClosingBraceRepair<EdgeLessonResult>(raw);
  } catch (err) {
    console.error(`LastMind: edge lesson generation failed to parse for "${fromNode.label}" -> "${toNode.label}" (${fromNodeId}->${toNodeId}).`, { rawLength: raw.length, rawSnippet: raw.slice(0, 300) }, err);
    throw err;
  }

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

  // Same pre-warm as generateAndCacheNodeLesson - fire-and-forget.
  getEdgeNoteBaseline(fromNodeId, toNodeId).catch((err) => console.error(`LastMind: failed to pre-warm the compiled note for edge ${fromNodeId}->${toNodeId}.`, err));

  return parsed;
}
