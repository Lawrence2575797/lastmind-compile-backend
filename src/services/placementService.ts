import { callClaudeJSON, MODELS } from './claudeClient';
import { getOrGenerateChain, normalizeConceptKey } from './chainService';
import { PLACEMENT_QUESTION_PROMPT } from '../constants/diagnosticPrompts';

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

interface ChainEdge { node_id: string; relationship: 'definitional' | 'reasoning'; }
interface ChainNode { id: string; label: string; depends_on: ChainEdge[]; }
interface Chain { concept_id: string; subject: string; nodes: ChainNode[]; }

export interface PlacementCheckResult {
  hasPrerequisite: boolean;
  question?: string;
  prerequisiteConceptKey?: string;
  prerequisiteConceptLabel?: string;
}

/**
 * Generates the placement question for a NEW lesson — testing whether the
 * student can reconstruct the reasoning chain leading up to (but not
 * including) today's new concept. If the concept has no real chain (a
 * genuinely atomic lesson with nothing to test readiness against), there's
 * nothing meaningful to ask — the caller should skip straight past this
 * step in that case.
 */
export async function startPlacementCheck(
  subject: string,
  topic: string,
  concept: string
): Promise<PlacementCheckResult> {
  const conceptKey = normalizeConceptKey(subject, topic, concept);
  const chainResult = await getOrGenerateChain(conceptKey, subject, topic, concept);

  if (!chainResult.chain) {
    return { hasPrerequisite: false };
  }

  const chain = chainResult.chain as Chain;
  if (chain.nodes.length < 2) {
    return { hasPrerequisite: false }; // no real prerequisite chain to test
  }

  // The final prerequisite is the node immediately before the lesson's own
  // target — the last node in the array is always the target itself.
  const prerequisiteNode = chain.nodes[chain.nodes.length - 2];
  const chainUpToPrerequisite = chain.nodes.slice(0, chain.nodes.length - 1);

  const conceptList = chainUpToPrerequisite.map((n) => n.label).join(', then ');
  const raw = await callClaudeJSON({
    model: MODELS.diagnosticTree,
    systemPrompt: PLACEMENT_QUESTION_PROMPT,
    userContent: `Subject: ${subject}\nPrerequisite chain leading to (and ending at) "${prerequisiteNode.label}": ${conceptList}`,
    temperature: 0.3,
  });

  const parsed = JSON.parse(stripCodeFences(raw)) as { question: string };

  return {
    hasPrerequisite: true,
    question: parsed.question,
    prerequisiteConceptKey: prerequisiteNode.id,
    prerequisiteConceptLabel: prerequisiteNode.label,
  };
}
