import test from 'node:test';
import assert from 'node:assert/strict';
import { criticalPath, performanceProfile } from '../lib/analytics.js';
import { buildGraph } from '../lib/graph.js';
import { buildFixtures } from './fixtures.js';

test('critical path follows the dominant duration chain', () => {
  const fx = buildFixtures();
  const graph = buildGraph(fx.parent, { header: fx.parentHeader });
  const cp = criticalPath(graph);
  assert.ok(cp.node_ids.includes('task'));
  // the subagent call (210→460, 250ms) dominates step 3 over the failing test (10ms)
  const subNode = graph.nodes.find((n) => n.type === 'subagent');
  assert.ok(cp.node_ids.includes(subNode.id), `critical path should traverse the long subagent call: ${cp.node_ids.join(' → ')}`);
  assert.ok(cp.duration_ms >= 250);
  assert.ok(cp.edge_ids.length === cp.node_ids.length - 1);
});

test('critical path prefers the slower parallel branch', () => {
  // hand-built: task → step(120ms window, 10ms LLM-only) → {fast(10ms), slow(100ms)} → step2(20ms)
  const nodes = [
    { id: 'task', type: 'task', duration_ms: 140, start_time: 0, end_time: 140 },
    { id: 's1', type: 'agent', duration_ms: 120, start_time: 0, end_time: 120, parent_id: 'task' },
    { id: 'fast', type: 'tool', duration_ms: 10, start_time: 10, end_time: 20, parent_id: 's1' },
    { id: 'slow', type: 'tool', duration_ms: 100, start_time: 10, end_time: 110, parent_id: 's1' },
    { id: 's2', type: 'agent', duration_ms: 20, start_time: 120, end_time: 140, parent_id: 'task' },
  ];
  const edges = [
    { id: 'e1', source: 'task', target: 's1', type: 'depends_on' },
    { id: 'e2', source: 's1', target: 'fast', type: 'calls' },
    { id: 'e3', source: 's1', target: 'slow', type: 'calls' },
    { id: 'e4', source: 'fast', target: 's2', type: 'consumes' },
    { id: 'e5', source: 'slow', target: 's2', type: 'consumes' },
  ];
  const cp = criticalPath({ nodes, edges });
  assert.deepEqual(cp.node_ids, ['task', 's1', 'slow', 's2']);
  assert.equal(cp.duration_ms, 130); // 10 (s1 LLM-only) + 100 (slow) + 20 (s2)
});

test('performance profile reports parallel peak and per-type time', () => {
  const fx = buildFixtures();
  const graph = buildGraph(fx.parent, { header: fx.parentHeader });
  const profile = performanceProfile(graph);
  assert.ok(profile.parallel_peak >= 2, 'read+grep run in parallel');
  assert.ok(profile.by_type.agent.count >= 4);
});
