import { normalizeConceptKey, getOrGenerateChain } from './chainService';
import { Chain } from './encodingLessonService';
import { getMasteryDetailsForConcepts, MasteryDetail } from './reviewService';
import { getConceptsWithLowConfidenceSignal } from './answerSignalService';

// One concept the student has actually added to a folder (a single-lesson
// page's own title, or one entry of a multi-lesson page's own lessons) —
// see learn/index.html's collectFolderConcepts, the frontend counterpart
// that builds this list from the folder's pages/subfolders. `topic` is
// the containing subfolder's name, or '' for a page sitting directly in
// the folder with no subfolder — matches how every other lesson-start
// call in this app already derives topic (see routes/encodingLesson.ts).
export interface FolderConcept {
  topic: string;
  concept: string;
}

export interface KnowledgeMapNode {
  id: string;
  name: string;
  // Every subfolder ("topic") whose own concept-chain included this node.
  // A page's own target concept belongs to exactly its containing
  // subfolder; a shared prerequisite pulled in by concepts from two
  // different subfolders legitimately lists both — that's not a bug to
  // resolve, it's the honest answer for something genuinely cross-cutting.
  // '' means a page sitting directly in the folder with no subfolder.
  // Drives the frontend's soft per-subfolder clustering (see
  // renderKnowledgeMapGraph) — a single-topic node clusters tightly with
  // its subfolder's other nodes, a multi-topic one visually sits between
  // whichever clusters share it, and cross-subfolder edges are never
  // hidden either way.
  topics: string[];
}

export interface KnowledgeMapEdge {
  source: string; // prerequisite
  target: string; // depends on it
}

export interface KnowledgeMapResult {
  nodes: KnowledgeMapNode[];
  edges: KnowledgeMapEdge[];
  mastery: Record<string, 0 | 1 | 2>;
  // The real numbers behind each node's mastery bucket — see
  // reviewService.ts's getMasteryDetailsForConcepts. A node with no
  // review row at all (mastery[id] === 0) has no entry here; there's
  // nothing real to show yet.
  masteryDetail: Record<string, MasteryDetail>;
  // Node ids flagged as "technically passed, but slow AND self-reported
  // low confidence" (see answerSignalService.ts) — a clean FSRS/mastery
  // state alone can hide exactly this kind of shakiness, so this rides
  // alongside `mastery` as a separate signal rather than changing it.
  lowConfidenceNodeIds: string[];
}

/**
 * Builds the merged "Your Progress" graph for one folder — every concept
 * the student has actually added (whole target + its full prerequisite
 * lineage, from that concept's own dependency_chains entry), unioned
 * across every concept in the folder so a prerequisite shared by two
 * different pages (e.g. "demand" feeding both "price elasticity" and
 * "consumer surplus") only ever appears once. Mastery is resolved in one
 * batch query at the end rather than per-node, and per-STUDENT — this
 * function's own OUTPUT is never cached (unlike the chains it reads,
 * which are cached per-concept in dependency_chains and shared across
 * every student), since mastery state is different for every user by
 * definition.
 */
export async function getKnowledgeMapForFolder(
  userId: string,
  subject: string,
  qualification: string,
  examBoard: string,
  customTitle: string,
  customDescription: string,
  concepts: FolderConcept[]
): Promise<KnowledgeMapResult> {
  if (!concepts.length) {
    return { nodes: [], edges: [], mastery: {}, masteryDetail: {}, lowConfidenceNodeIds: [] };
  }

  // Each concept's chain is looked up (or generated, on a genuine
  // first-ever miss) independently and in parallel — getOrGenerateChain
  // already caches per concept+qualification+examBoard+custom-digest (see
  // chainService.ts's dependency_chains), so only a concept truly never
  // touched by ANY student before pays real generation cost; every later
  // open of this same folder, by this student or any other studying the
  // same concept, is a cache hit.
  const chainResults = await Promise.all(
    concepts.map((c) => {
      const conceptKey = normalizeConceptKey(subject, c.topic, c.concept);
      return getOrGenerateChain(conceptKey, subject, c.topic, c.concept, qualification, examBoard, customTitle, customDescription);
    })
  );

  // Kept index-aligned with `concepts` (not filtered down separately)
  // specifically so each chain's own topic — the SUBFOLDER the concept
  // that produced it lives in — is still known while attributing nodes
  // below; a chain with no result (a genuine generation failure) just
  // contributes nothing rather than breaking that alignment.
  const nodeById = new Map<string, { id: string; name: string }>();
  const nodeTopics = new Map<string, Set<string>>();
  // Every node's OWN id (as it appears in `nodeById`, used for the graph
  // itself/edges/frontend interactions) is kept as-is — but the key used
  // to actually LOOK UP mastery can differ for one specific node per
  // chain: the TARGET (chain.nodes' last entry, guaranteed by
  // CHAIN_GENERATION_PROMPT rule 8). Completing that concept's own lesson
  // grades it via gradeAndRecordReview(userId, normalizeConceptKey(...))
  // (see encodingLessonService.ts/spacedLessonEngine.ts), NOT via the
  // chain's own LLM-invented node id for that same node — those two
  // strings are structurally different (colon-delimited "subject:topic:
  // concept" vs. a bare snake_case slug), so without this mapping the
  // target node's mastery would never be found even though a real,
  // fresh review row exists. Genuine prerequisite nodes ARE graded under
  // their own raw chain node id (diagnosisConceptKey = s.nodeId for any
  // non-target step), so they need no such override.
  // Collected in its OWN first pass, across every chain, before anything
  // reads it — this used to be folded into the merge loop below with a
  // "first writer wins" guard, which was order-dependent: if the SAME
  // node id happened to appear as a plain prerequisite in an
  // earlier-processed chain before its owning chain (elsewhere in this
  // same loop) reached it as ITS OWN target, the raw prerequisite id won
  // and the target's real mastery key got silently shadowed — explaining
  // why some genuinely-completed pages showed as unmastered while others
  // didn't, depending purely on array order. A node id can only ever be
  // ONE concept's own target, so populating this map completely before
  // the merge loop runs removes the ordering dependency entirely.
  const targetQueryKeyByNodeId = new Map<string, string>();
  chainResults.forEach((result, i) => {
    const chain = result.chain as Chain | null;
    if (!chain || !Array.isArray(chain.nodes) || !chain.nodes.length) return;
    const topic = concepts[i].topic || '';
    const targetNode = chain.nodes[chain.nodes.length - 1];
    targetQueryKeyByNodeId.set(targetNode.id, normalizeConceptKey(subject, topic, concepts[i].concept));
  });

  const queryKeyForNode = new Map<string, string>();
  chainResults.forEach((result, i) => {
    const chain = result.chain as Chain | null;
    if (!chain || !Array.isArray(chain.nodes)) return;
    const topic = concepts[i].topic || '';
    chain.nodes.forEach((node) => {
      if (!nodeById.has(node.id)) {
        nodeById.set(node.id, { id: node.id, name: node.label });
      }
      if (!nodeTopics.has(node.id)) nodeTopics.set(node.id, new Set());
      nodeTopics.get(node.id)!.add(topic);
      if (!queryKeyForNode.has(node.id)) {
        queryKeyForNode.set(node.id, targetQueryKeyByNodeId.get(node.id) || node.id);
      }
    });
  });

  // Edges come from each node's OWN depends_on list (its prerequisites) —
  // there's no separate top-level edge array on a Chain. Only kept when
  // both ends actually made it into the merged node set — a node's
  // depends_on can in principle reference an id outside what got returned
  // (e.g. a differently-generated chain that trimmed a shared ancestor
  // differently), and a dangling edge would just confuse the frontend's
  // own force layout for nothing. Cross-subfolder edges are never
  // filtered out here — clustering is purely a frontend LAYOUT concern
  // (see renderKnowledgeMapGraph), never a reason to hide a real
  // prerequisite relationship.
  const edgeKeys = new Set<string>();
  const edges: KnowledgeMapEdge[] = [];
  chainResults.forEach((result) => {
    const chain = result.chain as Chain | null;
    if (!chain || !Array.isArray(chain.nodes)) return;
    chain.nodes.forEach((node) => {
      (node.depends_on || []).forEach((dep) => {
        if (!nodeById.has(dep.node_id) || !nodeById.has(node.id)) return;
        const key = `${dep.node_id}->${node.id}`;
        if (edgeKeys.has(key)) return;
        edgeKeys.add(key);
        edges.push({ source: dep.node_id, target: node.id });
      });
    });
  });

  const nodeIds = Array.from(nodeById.keys());
  const queryKeys = nodeIds.map((id) => queryKeyForNode.get(id) || id);
  const [found, lowConfidenceQueryKeys] = await Promise.all([
    getMasteryDetailsForConcepts(userId, queryKeys),
    getConceptsWithLowConfidenceSignal(userId, queryKeys),
  ]);
  const mastery: Record<string, 0 | 1 | 2> = {};
  const masteryDetail: Record<string, MasteryDetail> = {};
  const lowConfidenceNodeIds: string[] = [];
  nodeIds.forEach((id) => {
    const queryKey = queryKeyForNode.get(id) || id;
    const detail = found.get(queryKey);
    mastery[id] = detail?.state ?? 0;
    if (detail) masteryDetail[id] = detail;
    if (lowConfidenceQueryKeys.has(queryKey)) lowConfidenceNodeIds.push(id);
  });

  const nodes: KnowledgeMapNode[] = nodeIds.map((id) => {
    const base = nodeById.get(id)!;
    return { id: base.id, name: base.name, topics: Array.from(nodeTopics.get(id) || []) };
  });

  return { nodes, edges, mastery, masteryDetail, lowConfidenceNodeIds };
}
