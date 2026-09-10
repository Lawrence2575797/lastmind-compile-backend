// Goal-driven "crash course" planning - given a language subject and a
// student's own stated goal + daily time budget, picks the minimal real
// subset of that subject's knowledge-map graph needed to achieve it. See
// C:\Users\lawre\.claude\plans\wise-humming-cloud.md for the full feature
// plan this implements. Everything past this point (lesson-taking, FSRS,
// credits) reuses the existing knowledge-map-v2 architecture unchanged -
// this service only decides WHICH nodes a folder should be scoped to.
import { selectAllRows, selectRowsByIdChunked } from './supabasePagination';
import { resolveSubjectTriple } from './subjectResolution';
import { callClaudeJSON, MODELS } from './claudeClient';
import { parseModelJson } from './jsonParsing';
import { CLASSIFY_SUBJECT_TITLE_PROMPT, OBJECTIVE_COURSE_PLAN_PROMPT } from '../constants/objectiveCoursePrompts';

export async function classifySubjectTitle(title: string, userId: string): Promise<boolean> {
  const raw = await callClaudeJSON({
    model: MODELS.simpleQuestion,
    systemPrompt: CLASSIFY_SUBJECT_TITLE_PROMPT,
    userContent: title,
    temperature: 0,
    userId,
    meteredReason: 'classify-subject-title',
  });
  const { isLanguage } = parseModelJson<{ isLanguage: boolean }>(raw);
  return !!isLanguage;
}

export interface ObjectiveCoursePlan {
  nodeIds: string[];
  estimatedLessons: number;
  estimatedDays: number;
  goal: string;
  minutesPerDay: number;
}

// Every node costs one 5-minute lesson the first time it's encoded, per
// the user's own stated architecture. Reviews are real but genuinely
// adaptive per student (FSRS) - this constant is a starting heuristic for
// the up-front estimate shown before a student commits, explicitly
// flagged as approximate (see the plan's own "Explicitly flagged, not
// hidden" section), not a promise. Revisit once real completion data
// exists for how many reviews a crash-course-sized node set actually
// needs per node.
const MINUTES_PER_LESSON = 5;
const REVIEW_MULTIPLIER = 1.5;
const DEFAULT_MINUTES_PER_DAY = 15;

/**
 * Deterministic prerequisite closure, walked in code rather than trusted
 * to the model - same BFS-over-incoming-edges approach as
 * chainDiagnosticService.ts's findPrerequisiteGap. This is the actual
 * correctness guarantee: whatever the model selects, the returned set is
 * always a complete, self-contained sub-graph a student could finish
 * start-to-end without hitting an untaught prerequisite mid-course.
 */
function closeOverPrerequisites(selectedIds: Set<string>, edges: { from_node_id: string; to_node_id: string }[]): Set<string> {
  const incoming = new Map<string, string[]>();
  edges.forEach((e) => {
    const list = incoming.get(e.to_node_id) || [];
    list.push(e.from_node_id);
    incoming.set(e.to_node_id, list);
  });
  const closure = new Set(selectedIds);
  const queue = Array.from(selectedIds);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const from of incoming.get(cur) || []) {
      if (!closure.has(from)) {
        closure.add(from);
        queue.push(from);
      }
    }
  }
  return closure;
}

export async function planObjectiveCourse(userId: string, rawSubject: string, goalAndPace: string): Promise<ObjectiveCoursePlan> {
  const { subject, qualification, examBoard } = await resolveSubjectTriple(rawSubject, 'Other', '');
  const nodeRows = await selectAllRows<{ id: string; label: string; subtopic: string }>(
    'knowledge_map_nodes',
    'id, label, subtopic',
    (q) => q.ilike('subject', subject.trim()).ilike('qualification', qualification.trim()).ilike('exam_board', examBoard.trim())
  );
  if (!nodeRows.length) {
    throw new Error(`No knowledge map has been generated yet for ${rawSubject}.`);
  }
  const nodeIdSet = new Set(nodeRows.map((r) => r.id));

  const rawEdgeRows = await selectRowsByIdChunked<{ from_node_id: string; to_node_id: string }>(
    'knowledge_map_edges',
    'from_node_id, to_node_id',
    'from_node_id',
    nodeRows.map((r) => r.id)
  );
  const edges = rawEdgeRows.filter((e) => nodeIdSet.has(e.to_node_id));

  // Referenced by index, not real id (see the prompt's own comment) -
  // this is the single biggest lever on this call's cost: a knowledge-map
  // node id is a UUID, ~15-20 tokens on its own, spelled out once per
  // node in a list that can run to several hundred nodes for a subject
  // like Spanish. The node list also lives in the CACHED system prompt
  // below rather than userContent - it's byte-identical for every
  // student planning a crash course in this same subject, so only the
  // first call per subject (per the cache's 1h TTL) pays full input
  // price for it; every call after that reads it at ~10% of the price.
  const idByIndex = nodeRows.map((r) => r.id);
  const nodeListText = nodeRows.map((n, i) => `${i} | ${n.subtopic} | ${n.label}`).join('\n');
  const raw = await callClaudeJSON({
    model: MODELS.diagnosticTree,
    systemPrompt: `${OBJECTIVE_COURSE_PLAN_PROMPT}\n\nSubject: ${subject}\n\nAvailable nodes for this subject (index | subtopic | label):\n${nodeListText}`,
    userContent: `Student's stated goal and pace: ${goalAndPace}`,
    temperature: 0.2,
    cacheSystemPrompt: true,
    userId,
    meteredReason: 'objective-course-plan',
  });
  const parsed = parseModelJson<{ goal: string; minutesPerDay: number; nodeIndices: number[] }>(raw);

  // Never trust an index the model invented - only indices genuinely
  // within this subject's own node list are eligible, same discipline
  // every other id-returning model call in this codebase already follows.
  const modelSelected = new Set(
    (parsed.nodeIndices || [])
      .filter((i) => Number.isInteger(i) && i >= 0 && i < idByIndex.length)
      .map((i) => idByIndex[i])
  );
  const closure = closeOverPrerequisites(modelSelected, edges);

  const minutesPerDay = Number.isFinite(parsed.minutesPerDay) && parsed.minutesPerDay > 0 ? Math.round(parsed.minutesPerDay) : DEFAULT_MINUTES_PER_DAY;
  const estimatedLessons = closure.size;
  const estimatedMinutes = estimatedLessons * MINUTES_PER_LESSON * (1 + REVIEW_MULTIPLIER);
  const estimatedDays = Math.max(1, Math.ceil(estimatedMinutes / minutesPerDay));

  return {
    nodeIds: Array.from(closure),
    estimatedLessons,
    estimatedDays,
    goal: parsed.goal?.trim() || goalAndPace,
    minutesPerDay,
  };
}
