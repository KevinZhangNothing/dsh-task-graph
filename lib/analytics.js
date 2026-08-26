/**
 * dsh-task-graph analytics: critical path and derived insights over a built
 * graph. Pure module (Node + browser).
 *
 * @module dsh-task-graph/analytics
 */

/**
 * Compute the critical path of a graph: the chain of nodes whose durations
 * dominate the task's wall-clock time. Runs on the execution edges only
 * (contains/retries are ignored); node weight is its own duration, and the
 * path weight is the sum of member weights. Parallel branches naturally race
 * — the longest one wins.
 *
 * @param {{nodes:Array,edges:Array}} graph
 * @returns {{node_ids:string[], edge_ids:string[], duration_ms:number, total_ms:number}}
 */
export function criticalPath(graph) {
  const weight = new Map();
  const nodeById = new Map();
  // Avoid double counting: an agent step's wall-clock window already covers
  // the tools executed inside it, so charge the step only its LLM-only time
  // (duration minus child tool durations, clamped at 0).
  const childDur = new Map();
  for (const node of graph.nodes) {
    nodeById.set(node.id, node);
    if (node.parent_id && node.type !== 'phase') {
      const parent = graph.nodes.find((p) => p.id === node.parent_id);
      if (parent && parent.type === 'agent') {
        childDur.set(parent.id, (childDur.get(parent.id) ?? 0) + Math.max(0, node.duration_ms ?? 0));
      }
    }
  }
  for (const node of graph.nodes) {
    const dur = Math.max(0, node.duration_ms ?? 0);
    if (node.type === 'task' || node.type === 'phase') weight.set(node.id, 0);
    else if (node.type === 'agent') weight.set(node.id, Math.max(0, dur - (childDur.get(node.id) ?? 0)));
    else weight.set(node.id, dur);
  }

  // adjacency over execution edges only (the builder emits explicit
  // depends_on spine edges task→phase→first-step→…→step; `contains` edges
  // would let the path teleport into any phase, so they stay out; retries
  // are self-edges, excluded below)
  const out = new Map();
  const indeg = new Map();
  const executionTypes = new Set(['depends_on', 'calls', 'invokes', 'delegates', 'consumes', 'modifies', 'validates', 'produces']);
  const edgeIndex = new Map(); // "s->t" → edge (first)
  for (const edge of graph.edges) {
    if (!executionTypes.has(edge.type)) continue;
    if (edge.source === edge.target) continue;
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    if (!out.has(edge.source)) out.set(edge.source, []);
    out.get(edge.source).push(edge);
    indeg.set(edge.target, (indeg.get(edge.target) ?? 0) + 1);
    const key = `${edge.source}->${edge.target}`;
    if (!edgeIndex.has(key)) edgeIndex.set(key, edge);
  }

  // Kahn topological order (graph is a DAG by construction once self retry
  // edges are excluded above)
  const order = [];
  const queue = [];
  for (const node of graph.nodes) {
    if ((indeg.get(node.id) ?? 0) === 0) queue.push(node.id);
  }
  const indegCopy = new Map(indeg);
  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    for (const edge of out.get(id) ?? []) {
      const left = (indegCopy.get(edge.target) ?? 1) - 1;
      indegCopy.set(edge.target, left);
      if (left === 0) queue.push(edge.target);
    }
  }

  // longest-path DP
  const dist = new Map();
  const prev = new Map();
  for (const id of graph.nodes.map((n) => n.id)) dist.set(id, -Infinity);
  const roots = order.filter((id) => nodeById.get(id).type === 'task');
  for (const r of roots.length > 0 ? roots : order.slice(0, 1)) dist.set(r, 0);

  for (const id of order) {
    const base = dist.get(id);
    if (base === -Infinity) continue;
    const w = weight.get(id) ?? 0;
    const total = base + w;
    for (const edge of out.get(id) ?? []) {
      if (total > dist.get(edge.target)) {
        dist.set(edge.target, total);
        prev.set(edge.target, id);
      }
    }
  }

  // pick the best end node (prefer leaves with real duration)
  let bestId = null;
  let bestVal = -Infinity;
  for (const id of order) {
    const d = dist.get(id);
    if (d === -Infinity) continue;
    const w = weight.get(id) ?? 0;
    const val = d + w;
    if (val > bestVal) {
      bestVal = val;
      bestId = id;
    }
  }

  const nodeIds = [];
  if (bestId !== null) {
    let cursor = bestId;
    while (cursor !== undefined && cursor !== null) {
      nodeIds.unshift(cursor);
      cursor = prev.get(cursor);
    }
  }
  const edgeIds = [];
  for (let i = 0; i + 1 < nodeIds.length; i += 1) {
    const edge = edgeIndex.get(`${nodeIds[i]}->${nodeIds[i + 1]}`);
    if (edge) edgeIds.push(edge.id);
  }
  const duration = nodeIds.reduce((acc, id) => acc + (weight.get(id) ?? 0), 0);
  return {
    node_ids: nodeIds,
    /** members that actually carry duration — what the UI should highlight */
    hot_node_ids: nodeIds.filter((id) => (weight.get(id) ?? 0) > 0),
    edge_ids: edgeIds,
    duration_ms: duration,
    total_ms: graph.duration_ms ?? duration,
  };
}

/**
 * Performance analysis helper (spec phase 2): parallel-width profile and
 * per-type time share, used by the summary drawer.
 *
 * @param {{nodes:Array}} graph
 */
export function performanceProfile(graph) {
  const byType = new Map();
  let parallelPeak = 0;
  const events = [];
  for (const node of graph.nodes) {
    if (node.start_time == null || node.end_time == null) continue;
    if (node.type === 'task' || node.type === 'phase') continue;
    const dur = Math.max(0, node.end_time - node.start_time);
    const cur = byType.get(node.type) ?? { count: 0, duration_ms: 0 };
    cur.count += 1;
    cur.duration_ms += dur;
    byType.set(node.type, cur);
    events.push([node.start_time, 1], [node.end_time, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let depth = 0;
  for (const [, delta] of events) {
    depth += delta;
    if (depth > parallelPeak) parallelPeak = depth;
  }
  return {
    by_type: Object.fromEntries(byType),
    parallel_peak: parallelPeak,
  };
}
