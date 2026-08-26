import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, STATUS, NODE_TYPE, EDGE_TYPE, classifyTool } from '../lib/graph.js';
import { buildFixtures } from './fixtures.js';

function graphWithChildren() {
  const fx = buildFixtures();
  const childStats = {
    id: 'child-001',
    ref: 'ws/child-001',
    title: 'review call sites',
    createdAt: fx.childHeader.createdAt,
    endTime: fx.child[fx.child.length - 1].time,
    status: 'SUCCESS',
    depth: 1,
    counts: { turns: 1, steps: 1, tools: 1, errors: 0 },
  };
  const graph = buildGraph(fx.parent, {
    header: fx.parentHeader,
    children: [childStats],
    workspace: '--repo--',
  });
  return { fx, graph };
}

test('task node carries identity, timing and status', () => {
  const { graph } = graphWithChildren();
  assert.equal(graph.task_id, 'task-nis-11688');
  assert.equal(graph.status, STATUS.SUCCESS);
  const task = graph.nodes.find((n) => n.type === NODE_TYPE.TASK);
  assert.ok(task);
  assert.equal(task.meta.title, 'NIS-11688 fix crash on save');
  assert.equal(task.meta.cwd, '/repo');
  assert.ok(task.duration_ms > 0);
});

test('phases group steps and steps group tools', () => {
  const { graph } = graphWithChildren();
  const phases = graph.nodes.filter((n) => n.type === NODE_TYPE.PHASE);
  assert.equal(phases.length, 2);
  const steps = graph.nodes.filter((n) => n.type === NODE_TYPE.AGENT);
  assert.equal(steps.length, 4); // 3 in turn 1 + 1 in turn 2
  for (const step of steps) {
    assert.ok(graph.nodes.some((p) => p.id === step.parent_id && p.type === NODE_TYPE.PHASE));
  }
  const tools = graph.nodes.filter((n) => [NODE_TYPE.TOOL, NODE_TYPE.CODE, NODE_TYPE.TEST, NODE_TYPE.SKILL, NODE_TYPE.SUBAGENT].includes(n.type));
  for (const tool of tools) {
    const parent = graph.nodes.find((n) => n.id === tool.parent_id);
    assert.equal(parent.type, NODE_TYPE.AGENT);
  }
});

test('parallel tools create fork/join edges', () => {
  const { graph } = graphWithChildren();
  const step1 = graph.nodes.find((n) => n.id === 'step-1-1');
  const reads = graph.edges.filter((e) => e.source === step1.id && e.type === EDGE_TYPE.CALLS);
  assert.equal(reads.length, 2, 'read + grep fork from one step');
  const step2 = graph.nodes.find((n) => n.id === 'step-1-2');
  const joins = graph.edges.filter((e) => e.target === step2.id && e.type === EDGE_TYPE.CONSUMES);
  assert.equal(joins.length, 2, 'both results join into the next step');
});

test('llm retry becomes attempts + retry self-edge, not node duplication', () => {
  const { graph } = graphWithChildren();
  const step2 = graph.nodes.find((n) => n.id === 'step-1-2');
  assert.equal(step2.meta.attempts.length, 1);
  assert.equal(step2.meta.attempts[0].failure.code, 'TIMEOUT');
  assert.equal(step2.status, STATUS.SUCCESS, 'retried then succeeded');
  assert.equal(step2.meta.retried, true);
  const retryEdges = graph.edges.filter((e) => e.type === EDGE_TYPE.RETRIES);
  assert.equal(retryEdges.length, 2, 'retry surfaces as self-edges, not duplicated nodes');
  const stepRetry = retryEdges.find((e) => e.source === step2.id);
  assert.equal(stepRetry.target, step2.id);
  assert.equal(stepRetry.meta.attempts, 1);
  const agentNodes = graph.nodes.filter((n) => n.type === NODE_TYPE.AGENT);
  assert.equal(agentNodes.length, 4, 'retry did not duplicate the step node');
});

test('identical failing-then-passing tool calls aggregate as attempts', () => {
  const { graph } = graphWithChildren();
  const tests = graph.nodes.filter((n) => n.type === NODE_TYPE.TEST);
  assert.equal(tests.length, 1, 'the flutter test run is one node');
  const testNode = tests[0];
  assert.equal(testNode.meta.attempts.length, 2);
  assert.equal(testNode.meta.attempts[0].status, STATUS.FAILED);
  assert.equal(testNode.meta.attempts[1].status, STATUS.SUCCESS);
  assert.equal(testNode.status, STATUS.SUCCESS);
  assert.equal(testNode.meta.retried, true);
});

test('tool classification: skill/subagent/code/test/plan', () => {
  assert.equal(classifyTool('skill', { name: 'code-review' }), NODE_TYPE.SKILL);
  assert.equal(classifyTool('subagent', {}), NODE_TYPE.SUBAGENT);
  assert.equal(classifyTool('edit', {}), NODE_TYPE.CODE);
  assert.equal(classifyTool('bash', { command: 'flutter test x' }), NODE_TYPE.TEST);
  assert.equal(classifyTool('bash', { command: 'ls -la' }), NODE_TYPE.TOOL);
  assert.equal(classifyTool('todo_write', {}), NODE_TYPE.PLAN);
});

test('subagent node links its child session', () => {
  const { graph } = graphWithChildren();
  const sub = graph.nodes.find((n) => n.type === NODE_TYPE.SUBAGENT);
  assert.ok(sub);
  assert.equal(sub.meta.child_session.id, 'child-001');
  assert.equal(sub.meta.child_session.title, 'review call sites');
  const delegates = graph.edges.filter((e) => e.type === EDGE_TYPE.DELEGATES);
  assert.equal(delegates.length, 1);
});

test('plan node records todos', () => {
  const { graph } = graphWithChildren();
  const plan = graph.nodes.find((n) => n.type === NODE_TYPE.PLAN);
  assert.ok(plan);
  assert.equal(plan.meta.todos.length, 3);
  assert.equal(plan.meta.todos[0].status, 'completed');
});

test('every node keeps trajectory linkage (event_ids/session/task ids)', () => {
  const { graph } = graphWithChildren();
  for (const node of graph.nodes) {
    assert.equal(node.session_id, 'task-nis-11688');
    assert.equal(node.task_id, 'task-nis-11688');
    assert.ok(Array.isArray(node.event_ids));
  }
  // tool nodes map both call and result seqs
  const testNode = graph.nodes.find((n) => n.type === NODE_TYPE.TEST);
  assert.ok(testNode.event_ids.length >= 3, 'call + result(+retry call) seqs retained');
});

test('summary aggregates counts, tokens and files', () => {
  const { graph } = graphWithChildren();
  const s = graph.summary;
  assert.equal(s.counts.phases, 2);
  assert.equal(s.counts.agents, 4);
  assert.equal(s.counts.subagents, 1);
  assert.equal(s.counts.code_changes, 2);
  assert.equal(s.counts.tests, 1);
  assert.equal(s.counts.files_changed, 1);
  assert.ok(s.tokens.input > 0 && s.tokens.output > 0);
  assert.equal(s.counts.errors, 0, 'the failed test attempt recovered, so no open errors');
  assert.ok(s.retried_steps.length >= 2, 'llm retry + test retry surfaced');
  assert.deepEqual(s.files_changed, ['src/save.dart']);
});

test('live mode keeps unclosed nodes RUNNING', () => {
  const fx = buildFixtures();
  const cut = fx.parent.slice(0, fx.parent.length - 6); // drop the final results/ends
  const graph = buildGraph(cut, { header: fx.parentHeader, live: true });
  const running = graph.nodes.filter((n) => n.status === STATUS.RUNNING);
  assert.ok(running.length >= 2, `expected running nodes, got ${running.length}`);
  assert.equal(graph.status, STATUS.RUNNING);
});

test('archived session marks unclosed nodes, not running', () => {
  const fx = buildFixtures();
  const cut = fx.parent.slice(0, fx.parent.length - 6);
  const graph = buildGraph(cut, { header: fx.parentHeader, live: false });
  assert.equal(graph.nodes.filter((n) => n.status === STATUS.RUNNING).length, 0);
});

test('failed task surfaces FAILED status', () => {
  const fx = buildFixtures();
  // end the session with an error turn reason
  const last = fx.parent[fx.parent.length - 1];
  fx.parent[fx.parent.length - 1] = { ...last, data: { turn: 2, reason: { kind: 'error', error: { message: 'boom', code: 'X' } } } };
  const graph = buildGraph(fx.parent, { header: fx.parentHeader });
  assert.equal(graph.status, STATUS.FAILED);
});
