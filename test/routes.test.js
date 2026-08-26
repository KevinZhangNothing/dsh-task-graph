import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi, quickStats, detectLive } from '../lib/routes.js';
import { buildFixtures } from './fixtures.js';

function memoryStore(fx) {
  const items = [
    { ref: 'ws/task-nis-11688', header: fx.parentHeader, events: fx.parent, info: { workspace: 'ws', dir: 'task-nis-11688', path: '/virtual', size: 1, mtime: 0 } },
    { ref: 'ws/child-001', header: fx.childHeader, events: fx.child, info: { workspace: 'ws', dir: 'child-001', path: '/virtual2', size: 1, mtime: 0 } },
  ];
  return {
    home: '/virtual-home',
    all: () => items,
    load: (ref) => items.find((i) => i.ref === ref) ?? null,
    childrenOf: (id) => items.filter((i) => i.header.parentSession === id),
    artifactInfo: () => null,
  };
}

test('tasks endpoint lists root tasks with stats', () => {
  const api = createApi(memoryStore(buildFixtures()));
  const { tasks, total } = api.tasks({});
  assert.equal(total, 1, 'child sessions are hidden from the root list');
  const t = tasks[0];
  assert.equal(t.id, 'task-nis-11688');
  assert.equal(t.title, 'NIS-11688 fix crash on save');
  assert.equal(t.status, 'SUCCESS');
  assert.equal(t.depth, 0);
  assert.ok(t.counts.steps >= 4);
  assert.ok(t.tokens_total > 0);
});

test('task endpoint returns the graph with critical path and child link', () => {
  const api = createApi(memoryStore(buildFixtures()));
  const graph = api.task({ id: 'ws/task-nis-11688' });
  assert.equal(graph.task_id, 'task-nis-11688');
  assert.ok(Array.isArray(graph.nodes) && graph.nodes.length > 8);
  assert.ok(graph.critical_path.node_ids.length >= 3);
  const sub = graph.nodes.find((n) => n.type === 'subagent');
  assert.equal(sub.meta.child_session.ref, 'ws/child-001');
});

test('events endpoint compacts the trajectory', () => {
  const api = createApi(memoryStore(buildFixtures()));
  const { events } = api.events({ id: 'ws/task-nis-11688' });
  assert.ok(events.length >= 20);
  for (const ev of events) {
    assert.ok(typeof ev.summary === 'string' && ev.summary.length > 0);
    assert.ok(ev.type);
  }
  const retry = events.find((e) => e.type === 'llm/retry');
  assert.match(retry.summary, /retry #1/);
});

test('event endpoint returns the full payload for one seq', () => {
  const api = createApi(memoryStore(buildFixtures()));
  const full = api.event({ id: 'ws/task-nis-11688', seq: 5 });
  assert.equal(full.seq, 5);
  assert.equal(full.type, 'tool/call');
});

test('detectLive needs recent mtime and an open turn', () => {
  const now = Date.now();
  const open = [{ type: 'turn/start', data: {} }];
  const closed = [{ type: 'turn/start', data: {} }, { type: 'turn/end', data: {} }];
  assert.equal(detectLive(open, now - 1000, now), true);
  assert.equal(detectLive(closed, now - 1000, now), false);
  assert.equal(detectLive(open, now - 600_000, now), false);
});

test('quickStats counts tokens and retries', () => {
  const fx = buildFixtures();
  const s = quickStats(fx.parent);
  assert.equal(s.turns, 2);
  assert.equal(s.steps, 4);
  assert.equal(s.retries, 1);
  assert.ok(s.tokens > 0);
  assert.equal(s.title, 'NIS-11688 fix crash on save');
});
