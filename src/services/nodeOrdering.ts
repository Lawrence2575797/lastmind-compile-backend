// Real prerequisite edges (knowledge_map_edges: from_node_id is the
// prerequisite, to_node_id the thing that depends on it - see
// fix_maths_map.js's own reasoning for this direction) already encode the
// one ordering fact that actually matters: a dependent concept must never
// be shown before what it depends on. The subtopic/teaching order computed
// elsewhere (getOrComputeSubtopicOrder, itself just a model's guess at a
// sensible reading order from labels alone, with no view of the real
// graph) can disagree with that - found live: "Proof by exhaustion" (which
// depends on "Structure of a mathematical proof") was still listed above
// its own prerequisite in the sidebar, because nothing had ever checked
// the guessed order against the graph it's supposed to be describing.
//
// This performs a stable topological sort (Kahn's algorithm) over the
// full node/edge set, using a preferred baseline order (the subtopic/
// teaching order) purely as a tie-break among nodes that are currently
// equally available (all their own prerequisites already placed) - so
// the result matches the preferred order everywhere the graph doesn't
// force otherwise, and only deviates from it exactly where a real
// dependency requires it. Deterministic, no model call, so it's free to
// run on every knowledge-map/notes load.
export interface DependencyEdge {
  from: string;
  to: string;
}

export function topologicalNodeOrder(
  nodeIds: string[],
  edges: DependencyEdge[],
  tieBreakRank: Map<string, number>
): string[] {
  const idSet = new Set(nodeIds);
  const inDegree = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const adjacency = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  edges.forEach(({ from, to }) => {
    if (!idSet.has(from) || !idSet.has(to)) return;
    adjacency.get(from)!.push(to);
    inDegree.set(to, (inDegree.get(to) || 0) + 1);
  });

  const rankOf = (id: string): number => tieBreakRank.get(id) ?? Number.MAX_SAFE_INTEGER;
  const byRank = (a: string, b: string): number => rankOf(a) - rankOf(b);

  let available = nodeIds.filter((id) => (inDegree.get(id) || 0) === 0).sort(byRank);
  const result: string[] = [];
  const placed = new Set<string>();

  while (available.length) {
    // Re-sort every step rather than maintaining a heap - subtopic-sized
    // node counts (tens, not thousands) make this cheap, and keeps the
    // "always pick the lowest-ranked currently-available node" behavior
    // obviously correct.
    available.sort(byRank);
    const next = available.shift()!;
    result.push(next);
    placed.add(next);
    (adjacency.get(next) || []).forEach((to) => {
      const remaining = (inDegree.get(to) || 0) - 1;
      inDegree.set(to, remaining);
      if (remaining === 0) available.push(to);
    });
  }

  // A real cycle would leave nodes unplaced - shouldn't happen post-
  // validation (see generate_knowledge_map.js's own cycle check), but
  // append anything left over in tie-break order rather than silently
  // dropping nodes from the sidebar.
  if (placed.size < nodeIds.length) {
    nodeIds
      .filter((id) => !placed.has(id))
      .sort(byRank)
      .forEach((id) => result.push(id));
  }

  return result;
}
