/**
 * Synthetic DSH trajectory fixtures for tests and the demo story.
 * The shape mirrors real `session.jsonl` events (see docs/trajectory-events.md).
 */

export function makeEvents(script) {
  const events = [];
  let seq = 0;
  const push = (type, time, data) => {
    events.push({ type, seq: seq++, time, data });
    return events[events.length - 1];
  };
  script(push);
  return events;
}

/**
 * Build the full fixture set — a compact "bug fix" story:
 *   Turn 1: analyze (parallel read+grep) → LLM retry → plan → patch(edit)
 *           → test(FAIL) + subagent delegation
 *   Turn 2: diagnosis → patch → same test command retried (SUCCESS attempt #2)
 * Plus the matching child (subagent) session events.
 */
export function buildFixtures(t0 = 1_787_000_000_000_000) {
  const parentHeader = {
    type: 'session', version: 0, id: 'task-nis-11688', createdAt: t0, cwd: '/repo', delegationDepth: 0,
  };
  const childHeader = {
    type: 'session', version: 0, id: 'child-001', createdAt: t0 + 230, cwd: '/repo',
    parentSession: 'task-nis-11688', origin: 'subagent', delegationDepth: 1,
  };

  let seq = 0;
  const parent = [parentHeader];
  const ev = (time, type, data) => parent.push({ type, seq: seq++, time, data });

  ev(t0 + 10, 'session/title', { title: 'NIS-11688 fix crash on save' });
  ev(t0 + 20, 'user/message', { id: 'm1', role: 'user', content: [{ type: 'text', text: 'Fix NIS-11688: crash when saving draft' }], source: { kind: 'user' } });
  ev(t0 + 30, 'turn/start', { turn: 1 });
  ev(t0 + 40, 'step/start', { turn: 1, step: 1 });
  ev(t0 + 45, 'request/header', { header: { config: { provider: 'test-llm', model: 'deepseek-v4', maxTokens: 8192 } } });
  ev(t0 + 50, 'tool/call', { turn: 1, step: 1, callId: 'call-read-1', name: 'read', arguments: '{"file_path":"src/save.dart"}' });
  ev(t0 + 55, 'tool/call', { turn: 1, step: 1, callId: 'call-grep-1', name: 'grep', arguments: '{"pattern":"saveDraft","path":"src"}' });
  ev(t0 + 70, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 1200, outputTokens: 90, cacheReadTokens: 500 } } });
  ev(t0 + 80, 'tool/result', { turn: 1, step: 1, message: { source: { kind: 'tool', callId: 'call-read-1' }, content: [{ type: 'tool-result', toolCallId: 'call-read-1', content: [{ type: 'text', text: 'class DraftSaver { ... }' }] }] } });
  ev(t0 + 85, 'tool/result', { turn: 1, step: 1, message: { source: { kind: 'tool', callId: 'call-grep-1' }, content: [{ type: 'tool-result', toolCallId: 'call-grep-1', content: [{ type: 'text', text: 'src/save.dart:42: saveDraft()' }] }] } });
  ev(t0 + 90, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'finish', reason: { kind: 'tool-calls' } } });
  ev(t0 + 100, 'step/end', { turn: 1, step: 1 });

  // step 2: LLM fails once (timeout), retries, then succeeds
  ev(t0 + 110, 'step/start', { turn: 1, step: 2 });
  ev(t0 + 120, 'llm/retry', { retryId: 'r1', turn: 1, step: 2, provider: 'test-llm', retry: 1, maxRetries: 6, delayMs: 900, failure: { message: 'Request timed out.', code: 'TIMEOUT' } });
  ev(t0 + 130, 'llm/retry-started', { retryId: 'r1', turn: 1, step: 2, retry: 1 });
  ev(t0 + 140, 'request/header', { header: { config: { provider: 'test-llm', model: 'deepseek-v4' } } });
  ev(t0 + 150, 'todo/write', { todos: [{ content: 'locate crash', status: 'completed' }, { content: 'patch saveDraft', status: 'in_progress' }, { content: 'run tests', status: 'pending' }] });
  ev(t0 + 160, 'assistant/chunk', { turn: 1, step: 2, chunk: { type: 'usage', usage: { inputTokens: 2400, outputTokens: 300 } } });
  ev(t0 + 170, 'step/end', { turn: 1, step: 2 });

  // step 3: patch + failing test + subagent delegation
  ev(t0 + 180, 'step/start', { turn: 1, step: 3 });
  ev(t0 + 190, 'tool/call', { turn: 1, step: 3, callId: 'call-edit-1', name: 'edit', arguments: '{"file_path":"src/save.dart","old_str":"x","new_str":"y"}' });
  ev(t0 + 200, 'tool/result', { turn: 1, step: 3, message: { source: { kind: 'tool', callId: 'call-edit-1' }, content: [{ type: 'tool-result', toolCallId: 'call-edit-1', content: [{ type: 'text', text: 'applied' }] }] } });
  ev(t0 + 210, 'tool/call', { turn: 1, step: 3, callId: 'call-test-1', name: 'bash', arguments: '{"command":"flutter test test/save_test.dart"}' });
  ev(t0 + 220, 'tool/call', { turn: 1, step: 3, callId: 'call-sub-1', name: 'subagent', arguments: '{"description":"review call sites","prompt":"check callers of saveDraft"}' });
  ev(t0 + 250, 'tool/result', { turn: 1, step: 3, message: { source: { kind: 'tool', callId: 'call-test-1' }, content: [{ type: 'tool-result', toolCallId: 'call-test-1', content: [{ type: 'text', text: 'Expected: true, Actual: false — test/save_test.dart:12' }], isError: true }] } });
  ev(t0 + 460, 'tool/result', { turn: 1, step: 3, message: { source: { kind: 'tool', callId: 'call-sub-1' }, content: [{ type: 'tool-result', toolCallId: 'call-sub-1', content: [{ type: 'text', text: '3 call sites verified' }] }] } });
  ev(t0 + 470, 'assistant/chunk', { turn: 1, step: 3, chunk: { type: 'usage', usage: { inputTokens: 3000, outputTokens: 200 } } });
  ev(t0 + 480, 'step/end', { turn: 1, step: 3 });
  ev(t0 + 490, 'turn/end', { turn: 1, reason: { kind: 'completed' } });

  // Turn 2: diagnose → patch → rerun same test command → success
  ev(t0 + 500, 'turn/start', { turn: 2 });
  ev(t0 + 510, 'step/start', { turn: 2, step: 1 });
  ev(t0 + 520, 'tool/call', { turn: 2, step: 1, callId: 'call-edit-2', name: 'edit', arguments: '{"file_path":"src/save.dart","old_str":"y","new_str":"z"}' });
  ev(t0 + 530, 'tool/result', { turn: 2, step: 1, message: { source: { kind: 'tool', callId: 'call-edit-2' }, content: [{ type: 'tool-result', toolCallId: 'call-edit-2', content: [{ type: 'text', text: 'applied' }] }] } });
  ev(t0 + 540, 'tool/call', { turn: 2, step: 1, callId: 'call-test-2', name: 'bash', arguments: '{"command":"flutter test test/save_test.dart"}' });
  ev(t0 + 600, 'tool/result', { turn: 2, step: 1, message: { source: { kind: 'tool', callId: 'call-test-2' }, content: [{ type: 'tool-result', toolCallId: 'call-test-2', content: [{ type: 'text', text: 'All tests passed' }] }] } });
  ev(t0 + 610, 'assistant/chunk', { turn: 2, step: 1, chunk: { type: 'usage', usage: { inputTokens: 900, outputTokens: 60 } } });
  ev(t0 + 620, 'step/end', { turn: 2, step: 1 });
  ev(t0 + 630, 'turn/end', { turn: 2, reason: { kind: 'completed' } });

  // child (subagent) session events
  let cseq = 0;
  const child = [childHeader];
  const cev = (time, type, data) => child.push({ type, seq: cseq++, time, data });
  cev(t0 + 240, 'session/title', { title: 'review call sites' });
  cev(t0 + 250, 'turn/start', { turn: 1 });
  cev(t0 + 260, 'step/start', { turn: 1, step: 1 });
  cev(t0 + 270, 'tool/call', { turn: 1, step: 1, callId: 'c-read', name: 'grep', arguments: '{"pattern":"saveDraft"}' });
  cev(t0 + 300, 'tool/result', { turn: 1, step: 1, message: { source: { kind: 'tool', callId: 'c-read' }, content: [{ type: 'tool-result', toolCallId: 'c-read', content: [{ type: 'text', text: 'ok' }] }] } });
  cev(t0 + 440, 'step/end', { turn: 1, step: 1 });
  cev(t0 + 450, 'turn/end', { turn: 1, reason: { kind: 'completed' } });

  return { parentHeader, parent, childHeader, child };
}
