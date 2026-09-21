import bundleJson from '../data/derivationEconomics.json';
import { supabaseAdmin } from './supabaseAdmin';

// Economics is taught by derivation lessons (see scripts/derivation): one stage per group of related knowledge-map concepts, generated
// offline, checked by code and compiled into src/data/derivationEconomics.json. This replaces the old per-node text lessons for the
// Edexcel Economics map: those are never generated again, and any stored old lesson is overwritten with the content built here.

interface StageTerm { t: string; c: string }
interface Stage { i: number; name: string; edges: [string, string][]; nodes: string[]; concepts: string[]; terms: Record<string, StageTerm>; stage: any }
interface Bundle { subject: string; qualification: string; examBoard: string; stages: (Stage | null)[]; byConcept: Record<string, number> }
const bundle = bundleJson as unknown as Bundle;

export interface NodeIdentity { id: string; node_key: string | null; concept_id: string; subject: string | null; qualification: string | null; exam_board: string | null; label?: string | null }

export function derivationStageForNode(n: NodeIdentity): number | null {
  if (!n || n.subject !== bundle.subject || n.qualification !== bundle.qualification || n.exam_board !== bundle.examBoard) return null;
  const i = bundle.byConcept[n.concept_id];
  return typeof i === 'number' && bundle.stages[i] ? i : null;
}

export function derivationStage(i: number): Stage | null {
  return Number.isInteger(i) && i >= 0 && bundle.stages[i] ? (bundle.stages[i] as Stage) : null;
}

export function derivationConceptsOfStage(i: number): string[] {
  return derivationStage(i)?.concepts ?? [];
}

// What the client's player needs: the compiled lesson and its terms.
export function derivationPlayerPayload(i: number): { terms: Record<string, StageTerm>; stage: any } | null {
  const s = derivationStage(i);
  return s ? { terms: s.terms, stage: s.stage } : null;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// The longest chain of ideas through this term, from the stage's own links: what an "order" question can ask for.
function chainThrough(s: Stage, key: string): string[] {
  const out: Record<string, string[]> = {}; const inn: Record<string, string[]> = {};
  s.edges.forEach(([a, b]) => { (out[a] = out[a] || []).push(b); (inn[b] = inn[b] || []).push(a); });
  const up = (k: string, seen: Set<string>): string[] => {
    let best: string[] = [];
    (inn[k] || []).forEach((p) => { if (!seen.has(p)) { const c = up(p, new Set([...seen, p])); if (c.length + 1 > best.length) best = [...c, p]; } });
    return best;
  };
  const down = (k: string, seen: Set<string>): string[] => {
    let best: string[] = [];
    (out[k] || []).forEach((c) => { if (!seen.has(c)) { const d = down(c, new Set([...seen, c])); if (d.length + 1 > best.length) best = [c, ...d]; } });
    return best;
  };
  return [...up(key, new Set([key])), key, ...down(key, new Set([key]))];
}

// The stored lesson content for one concept, in the format every existing reader (notes, ask, reviews, Day-1 checks) already understands.
export function derivationContentForNode(n: NodeIdentity): any | null {
  const i = derivationStageForNode(n);
  if (i === null || !n.node_key) return null;
  const s = bundle.stages[i] as Stage;
  const term = s.terms[n.node_key];
  if (!term) return null;
  const step = (s.stage.script as any[]).find((x) => (x.type === 'ask' || x.type === 'read') && x.term === n.node_key);
  if (!step) return null;
  const label = term.t;
  const scenario = step.type === 'ask' ? `${step.q} ${cap(step.opts[0])}.` : `${step.text.trim()} ${label}.`;
  const statement = step.type === 'ask' ? `${step.pre.trim()} ${label}.` : `${label}.`;
  const chain = chainThrough(s, n.node_key).map((k) => s.terms[k]?.t).filter(Boolean);
  const explanation = [scenario, statement, chain.length > 1 ? `This idea sits in a chain of ideas: ${chain.join(' → ')}.` : ''].filter(Boolean).join('\n\n');

  // A multiple-choice check on this term: its own label against three others from the same lesson (or the wider map).
  const others = Object.keys(s.terms).filter((k) => k !== n.node_key).map((k) => s.terms[k].t);
  const pool: string[] = [...others];
  for (let j = 1; pool.length < 3 && j < bundle.stages.length; j++) {
    const t = bundle.stages[(i + j) % bundle.stages.length];
    if (t) Object.values(t.terms).forEach((x) => { if (pool.length < 3 && x.t !== label && !pool.includes(x.t)) pool.push(x.t); });
  }
  const options = [label, ...pool.slice(0, 3)];
  const rot = i % 4;
  const shuffled = options.map((_, k) => options[(k + rot) % 4]);
  const mc = {
    format: 'multiple_choice',
    questionText: step.type === 'ask' ? `${step.q} ${cap(step.opts[0])}. What is this idea called?` : `${step.text.trim()} ___. What is this idea called?`,
    options: shuffled,
    correctOptionIndex: shuffled.indexOf(label),
  };
  const recallChecks: any[] = [mc];
  const path = chainThrough(s, n.node_key);
  if (path.length >= 3 && path.length <= 6) {
    recallChecks.push({
      format: 'order', questionText: 'Put these ideas in the order they build on each other.',
      items: path.map((k) => s.terms[k]?.t).filter(Boolean),
    });
  }
  return { explanation, practiceQuestion: mc, recallChecks, formatVersion: 2, derivation: true, stage: i };
}

// Loads the node, and if the Economics derivation covers it, makes sure the stored lesson row holds the derivation-built content
// (overwriting any old text lesson). Returns null for every other node so callers carry on as before.
export async function ensureDerivationContent(nodeId: string): Promise<{ content: any; stage: number } | null> {
  const { data: node } = await supabaseAdmin.from('knowledge_map_nodes').select('id, node_key, concept_id, subject, qualification, exam_board, label').eq('id', nodeId).maybeSingle();
  if (!node) return null;
  const stage = derivationStageForNode(node as NodeIdentity);
  if (stage === null) return null;
  const content = derivationContentForNode(node as NodeIdentity);
  if (!content) return null;
  const { data: row } = await supabaseAdmin.from('knowledge_map_node_lessons').select('encoding_content').eq('node_id', nodeId).maybeSingle();
  const stored = row?.encoding_content as any;
  if (!stored || !stored.derivation || stored.stage !== stage || stored.explanation !== content.explanation) {
    const { error } = await supabaseAdmin.from('knowledge_map_node_lessons').upsert({ node_id: nodeId, encoding_content: content }, { onConflict: 'node_id' });
    if (error) throw error;
  }
  return { content, stage };
}

// Every node row of one stage, by concept id.
export async function derivationNodeIds(stage: number): Promise<string[]> {
  const concepts = derivationConceptsOfStage(stage);
  if (!concepts.length) return [];
  const { data } = await supabaseAdmin.from('knowledge_map_nodes').select('id').eq('subject', bundle.subject).eq('qualification', bundle.qualification).eq('exam_board', bundle.examBoard).in('concept_id', concepts);
  return (data || []).map((r: any) => r.id as string);
}
