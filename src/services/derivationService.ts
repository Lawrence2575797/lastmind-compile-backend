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

// "... is a" + "Capital goods" reads wrongly: after "a" or "an" the term goes in the singular ("a capital good").
function singularWord(w: string): string {
  if (w.length < 4 || /[0-9]/.test(w) || w === w.toUpperCase()) return w;
  if (/(ss|us|is|ics|ness)$/i.test(w)) return w;
  if (/ies$/i.test(w)) return w.slice(0, -3) + 'y';
  if (/(sses|xes|ches|shes)$/i.test(w)) return w.slice(0, -2);
  if (/s$/i.test(w)) return w.slice(0, -1);
  return w;
}
export function labelAfterArticle(before: string, label: string): string {
  if (!/\b(a|an)\s*$/i.test(before)) return label;
  const parts = label.split(' ');
  parts[parts.length - 1] = singularWord(parts[parts.length - 1]);
  return parts.join(' ');
}

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
  const scenario = step.type === 'ask' ? `${step.q} ${cap(step.opts[0])}.` : `${step.text.trim()} ${labelAfterArticle(step.text, label)}.`;
  const statement = step.type === 'ask' ? `${step.pre.trim()} ${labelAfterArticle(step.pre, label)}.` : `${label}.`;
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

// ---- Section-level checks and the growing explanation ladder ----

export function derivationStageOfConcept(conceptId: string): number | null {
  const i = bundle.byConcept[conceptId];
  return typeof i === 'number' && bundle.stages[i] ? i : null;
}

// One concept stands for the whole lesson when it comes to scheduling: the Day-1 check is about the section, not about each concept.
export function derivationAnchorConcept(stage: number): string | null {
  return derivationStage(stage)?.concepts[0] ?? null;
}

// The idea, in the words of the lesson: what the student was shown and what it is called.
function statementFor(s: Stage, key: string): string {
  const step = (s.stage.script as any[]).find((x) => (x.type === 'ask' || x.type === 'read') && x.term === key);
  const label = s.terms[key]?.t ?? key;
  if (!step) return label;
  return step.type === 'ask' ? `${step.q} ${cap(step.opts[0])}. ${step.pre.trim()} ${labelAfterArticle(step.pre, label)}.` : `${step.text.trim()} ${labelAfterArticle(step.text, label)}.`;
}

function introOrder(s: Stage): string[] {
  return (s.stage.script as any[]).filter((x) => x.type === 'ask' || x.type === 'read').map((x) => x.term as string);
}

// The longest chain of ideas in the whole lesson (it always has at least three: the checker requires a chain of two links).
function mainChain(s: Stage): string[] {
  const out: Record<string, string[]> = {};
  s.edges.forEach(([a, b]) => { (out[a] = out[a] || []).push(b); });
  const from = (k: string, path: Set<string>): string[] => {
    let best: string[] = [];
    (out[k] || []).forEach((c) => { if (!path.has(c)) { const d = from(c, new Set([...path, c])); if (d.length > best.length) best = d; } });
    return [k, ...best];
  };
  let best: string[] = [];
  Object.keys(s.terms).forEach((k) => { const c = from(k, new Set([k])); if (c.length > best.length) best = c; });
  return best;
}

// A term's label can carry a formula or abbreviation in brackets ("Average variable cost (AVC = TVC/Q)") - nobody can type that from
// memory, so the plain name in front of the brackets is what's actually asked for, with the full label and any abbreviation accepted too.
function coreLabel(label: string): string {
  const m = label.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  return m && m[1].trim() ? m[1].trim() : label;
}
function labelAlts(label: string): string[] {
  const alts = new Set([label.toLowerCase(), coreLabel(label).toLowerCase()]);
  const abbr = label.match(/\(([A-Z]{2,6})\b/);
  if (abbr) alts.add(abbr[1].toLowerCase());
  return Array.from(alts);
}

// The Day-1 check for a whole lesson: fill in the key words of its main chain of ideas, in order. Typing the words fills them in, and where
// each one goes puts them in order, so the one task is both. Graded exactly, no AI.
export function derivationSectionQuestion(stage: number): any | null {
  const s = derivationStage(stage);
  if (!s) return null;
  const chain = mainChain(s);
  if (chain.length < 3) return null;
  const shown = chain.length > 7 ? chain.slice(0, chain.length - 6) : chain.slice(0, 1);
  const blanks = chain.slice(shown.length);
  const label = (k: string) => s.terms[k]?.t ?? k;
  const text = [...shown.map(label), ...blanks.map(() => '___')].join(' → ');
  return {
    format: 'cloze',
    questionText: `"${s.stage.title}": fill in the key words of the chain, in order. Each blank is one key term, and each idea leads to the next.`,
    markScheme: chain.map(label).join(' → '),
    text,
    blanks: blanks.map((k) => ({ answer: coreLabel(label(k)), alt: labelAlts(label(k)) })),
  };
}

// Spaced repetition asks for a bigger explanation each time: one idea, then a short chain, then the whole chain, then the whole lesson.
export function derivationLadder(conceptId: string, reps: number): { questionText: string; markScheme: string; level: number } | null {
  const i = derivationStageOfConcept(conceptId);
  if (i === null) return null;
  const s = bundle.stages[i] as Stage;
  const key = s.nodes[s.concepts.indexOf(conceptId)];
  if (!key) return null;
  const label = (k: string) => s.terms[k]?.t ?? k;
  const path = chainThrough(s, key);
  const level = reps < 2 ? 0 : reps < 4 ? 1 : reps < 6 ? 2 : 3;
  let scope: string[];
  let questionText: string;
  if (level === 0 || path.length < 3) {
    scope = [key];
    questionText = `In your own words, explain: ${label(key)}.`;
  } else if (level === 1) {
    const at = path.indexOf(key);
    scope = path.slice(Math.max(0, at - 2), at + 1);
    questionText = scope.length > 1 ? `In your own words, explain how ${scope.slice(0, -1).map(label).join(' and then ')} lead to ${label(key)}.` : `In your own words, explain: ${label(key)}.`;
  } else if (level === 2) {
    scope = path;
    questionText = `In your own words, explain the whole chain of ideas from ${label(path[0])} to ${label(path[path.length - 1])}: how each one leads to the next.`;
  } else {
    scope = introOrder(s);
    questionText = `In your own words, explain the whole topic "${s.stage.title}": cover ${scope.map(label).join(', ')} and how they connect.`;
  }
  return { questionText, markScheme: scope.map((k) => `${label(k)}: ${statementFor(s, k)}`).join('\n'), level };
}

// Every concept of the lesson this one belongs to (they are graded together after a section check).
export function derivationSiblingConcepts(conceptId: string): string[] {
  const i = derivationStageOfConcept(conceptId);
  return i === null ? [] : (bundle.stages[i] as Stage).concepts;
}

// The fast path for opening a lesson: one small query for the node, everything else from memory (the compiled lesson is already loaded).
// The stored lesson row is refreshed in the background, never on the student's wait.
export async function derivationQuick(nodeId: string): Promise<{ content: any; stage: number; payload: { terms: Record<string, StageTerm>; stage: any } } | null> {
  const { data: node } = await supabaseAdmin.from('knowledge_map_nodes').select('id, node_key, concept_id, subject, qualification, exam_board, label').eq('id', nodeId).maybeSingle();
  if (!node) return null;
  const stage = derivationStageForNode(node as NodeIdentity);
  if (stage === null) return null;
  const content = derivationContentForNode(node as NodeIdentity);
  const payload = derivationPlayerPayload(stage);
  if (!content || !payload) return null;
  ensureDerivationContent(nodeId).catch((e) => console.error('LastMind: derivation content refresh failed', nodeId, e));
  return { content, stage, payload };
}

// The student's own key-term map: every lesson they have completed (all of its concepts have a schedule entry), with its graph. It grows by
// one lesson each time one is finished.
export async function derivationCompletedStages(userId: string): Promise<any[]> {
  const learned = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from('concept_reviews').select('concept_id').eq('user_id', userId).like('concept_id', 'economics:%').range(from, from + 999);
    if (error) throw error;
    (data || []).forEach((r: any) => learned.add(r.concept_id as string));
    if (!data || data.length < 1000) break;
  }
  const out: any[] = [];
  bundle.stages.forEach((s) => {
    if (!s || !s.concepts.length || !s.concepts.every((c) => learned.has(c))) return;
    out.push({ i: s.i, name: s.name, title: s.stage.title, sub: s.stage.sub, terms: s.terms, graph: { h: s.stage.graph.h, nodes: s.stage.graph.nodes, edges: s.stage.graph.edges, given: s.stage.graph.given } });
  });
  return out;
}

// One graph for everything the student has learned. A concept from the knowledge map is the same node wherever it appears, so lessons join up
// through the terms they share; a building-block term belongs to its own lesson (two lessons can each have a "choice" without being the same idea).
// Links that would close a loop are dropped, so the result never circles back.
export async function derivationKeyTermGraph(userId: string): Promise<{ terms: Record<string, { t: string; c: string; lesson: number }>; edges: [string, string][] }> {
  return mergeStagesIntoGraph((await derivationCompletedStages(userId)).map((d) => d.i));
}

export function mergeStagesIntoGraph(stageIds: number[]): { terms: Record<string, { t: string; c: string; lesson: number }>; edges: [string, string][] } {
  const done = stageIds.map((i) => ({ i }));
  const terms: Record<string, { t: string; c: string; lesson: number }> = {};
  const edgeSet = new Set<string>();
  done.forEach((d) => {
    const s = bundle.stages[d.i] as Stage;
    const mapKeys = new Set<string>([...s.nodes, ...(s.stage.graph.given as string[])]);
    const id = (k: string) => (mapKeys.has(k) ? k : `${s.i}:${k}`);
    Object.keys(s.terms).forEach((k) => {
      const nid = id(k);
      const isGiven = (s.stage.graph.given as string[]).includes(k);
      if (!terms[nid] || (!isGiven && terms[nid].lesson < 0)) terms[nid] = { t: s.terms[k].t, c: s.terms[k].c, lesson: isGiven ? -1 : s.i };
    });
    s.edges.forEach(([a, b]) => { if (s.terms[a] && s.terms[b]) edgeSet.add(`${id(a)}\u0000${id(b)}`); });
  });
  // drop any link that closes a loop (depth-first, keeping the first links seen)
  const out: Record<string, string[]> = {};
  const kept: [string, string][] = [];
  const reaches = (from: string, to: string): boolean => {
    const stack = [from]; const seen = new Set<string>();
    while (stack.length) { const n = stack.pop() as string; if (n === to) return true; if (seen.has(n)) continue; seen.add(n); (out[n] || []).forEach((m) => stack.push(m)); }
    return false;
  };
  [...edgeSet].sort().forEach((e) => {
    const [a, b] = e.split('\u0000');
    if (a === b || reaches(b, a)) return;
    (out[a] = out[a] || []).push(b); kept.push([a, b]);
  });
  Object.keys(terms).forEach((k) => { if (terms[k].lesson < 0) terms[k].lesson = 0; });
  return { terms, edges: kept };
}

