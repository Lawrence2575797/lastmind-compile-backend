import { callClaudeJSON, MODELS } from './claudeClient';
import { getOrGenerateChain, normalizeConceptKey } from './chainService';
import { PREREQUISITE_BRANCH_QUESTIONS_PROMPT } from '../constants/diagnosticPrompts';

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

interface ChainEdge { node_id: string; relationship: 'definitional' | 'reasoning'; }
interface ChainNode { id: string; label: string; depends_on: ChainEdge[]; }
interface Chain { concept_id: string; subject: string; nodes: ChainNode[]; }

function findNode(chain: Chain, id: string): ChainNode | undefined {
  return chain.nodes.find((n) => n.id === id);
}

// Walks backward from a branch's own root node, collecting every ancestor
// it depends on (its own sub-chain) — topologically ordered, earliest
// ancestor first, the branch node itself last. Cycle-safe via `seen`, same
// pattern as mechanisticEngine's chainDepth.
function collectUpstreamChain(chain: Chain, nodeId: string, seen = new Set<string>()): ChainNode[] {
  if (seen.has(nodeId)) return [];
  seen.add(nodeId);
  const node = findNode(chain, nodeId);
  if (!node) return [];
  const ancestors: ChainNode[] = [];
  for (const edge of node.depends_on) {
    ancestors.push(...collectUpstreamChain(chain, edge.node_id, seen));
  }
  return [...ancestors, node];
}

export interface PrerequisiteBranchQuestion {
  conceptLabel: string;
  question: string;
}

export interface PrerequisiteCheckResult {
  hasPrerequisites: boolean;
  questions: PrerequisiteBranchQuestion[];
}

/**
 * Generates the prerequisite-readiness questions for a NEW lesson — one
 * question per DIRECT prerequisite branch of the lesson's own concept
 * (e.g. "Crowding Out" depends separately on a government-budget/deficit
 * branch AND a supply-and-demand branch — each gets its own question,
 * testing the reasoning chain leading up to and including that branch,
 * never the new lesson's own content). All questions come from a single
 * Claude call, one branch per line item in the prompt.
 *
 * If the concept has no real prerequisite chain (a genuinely atomic
 * lesson with nothing to test readiness against), there's nothing
 * meaningful to ask — the caller should treat the lesson as immediately
 * unlocked in that case.
 *
 * Deliberately has no matching "submit" endpoint here — each returned
 * question's answer is submitted through the existing, already-built
 * /diagnostics/submit-answer, one branch at a time, treating it exactly
 * like any other first question (same slip-check, same encoding-check,
 * same atomic/mechanistic branching down to the actual root cause, same
 * real corrections). No new diagnostic logic needed, only the batched
 * question generation itself is new.
 */
export async function startPlacementCheck(
  subject: string,
  topic: string,
  concept: string
): Promise<PrerequisiteCheckResult> {
  const conceptKey = normalizeConceptKey(subject, topic, concept);
  const chainResult = await getOrGenerateChain(conceptKey, subject, topic, concept);

  if (!chainResult.chain) {
    return { hasPrerequisites: false, questions: [] };
  }

  const chain = chainResult.chain as Chain;
  const target = chain.nodes[chain.nodes.length - 1];
  if (!target || target.depends_on.length === 0) {
    return { hasPrerequisites: false, questions: [] }; // no real prerequisite chain to test
  }

  const branches = target.depends_on
    .map((edge) => findNode(chain, edge.node_id))
    .filter((node): node is ChainNode => !!node);

  if (!branches.length) {
    return { hasPrerequisites: false, questions: [] };
  }

  const branchSections = branches
    .map((branch) => {
      const chainList = collectUpstreamChain(chain, branch.id).map((n) => n.label).join(', then ');
      return `Branch ID: ${branch.id}\nBranch chain (leading to and including "${branch.label}"): ${chainList}`;
    })
    .join('\n\n');

  const raw = await callClaudeJSON({
    model: MODELS.diagnosticTree,
    systemPrompt: PREREQUISITE_BRANCH_QUESTIONS_PROMPT,
    userContent: `Subject: ${subject}\nNew lesson concept: ${target.label}\n\n${branchSections}`,
    temperature: 0.3,
  });

  const parsed = JSON.parse(stripCodeFences(raw)) as { questions: { branchId: string; question: string }[] };

  const questions: PrerequisiteBranchQuestion[] = (parsed.questions || [])
    .map((q) => {
      const branch = branches.find((b) => b.id === q.branchId);
      if (!branch) return null;
      return { conceptLabel: branch.label, question: q.question };
    })
    .filter((q): q is PrerequisiteBranchQuestion => !!q);

  return { hasPrerequisites: questions.length > 0, questions };
}
