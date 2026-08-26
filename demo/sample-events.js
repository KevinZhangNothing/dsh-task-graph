/**
 * Demo data for the standalone preview (`npm run demo`).
 *
 * Three scripted tasks that exercise the whole plugin surface without
 * needing a real DSH installation:
 *   demo/bugfix-NIS-11688  — rich completed task (skills, parallel tools,
 *                            subagents, retries, code changes, failing test
 *                            that finally passes on attempt #3)
 *   demo/deploy-rollback   — FAILED task for error localization
 *   demo/live-triage       — a RUNNING task the demo server replays live
 *
 * The shapes are real DSH trajectory events (see docs/trajectory-events.md),
 * so the same graph builder code path is exercised end to end.
 */

function makeWriter(header) {
  const events = [header];
  let seq = 0;
  return {
    events,
    header,
    ev(time, type, data) {
      events.push({ type, seq: seq += 1, time, data });
      return events[events.length - 1];
    },
  };
}

function usageTurn(w, t, turn, step, input, output, cache = 0) {
  w.ev(t, 'assistant/chunk', { turn, step, chunk: { type: 'usage', usage: { inputTokens: input, outputTokens: output, cacheReadTokens: cache } } });
}

function toolCall(w, t, turn, step, callId, name, args) {
  w.ev(t, 'tool/call', { turn, step, callId, name, arguments: JSON.stringify(args) });
}

function toolOk(w, t, turn, step, callId, text) {
  w.ev(t, 'tool/result', {
    turn, step,
    message: {
      source: { kind: 'tool', callId },
      content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text }] }],
    },
  });
}

function toolErr(w, t, turn, step, callId, text, error) {
  w.ev(t, 'tool/result', {
    turn, step,
    message: {
      source: { kind: 'tool', callId },
      content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text }], isError: true }],
    },
    error,
  });
}

/* ------------------------------------------------------------------ */
/* Task 1: completed bug-fix with everything                          */
/* ------------------------------------------------------------------ */
export function bugfixTask() {
  const T0 = 1_787_600_000_000;
  const header = { type: 'session', version: 0, id: 'demo-bugfix-NIS-11688', createdAt: T0, cwd: '/Users/dev/Napkin', delegationDepth: 0 };
  const w = makeWriter(header);
  let t = T0 + 500;
  const dt = (ms) => (t += ms);

  w.ev(t, 'session/title', { title: 'NIS-11688 修复草稿保存崩溃' });
  w.ev(dt(300), 'user/message', { id: 'm1', role: 'user', content: [{ type: 'text', text: 'NIS-11688: 录音草稿保存时偶发崩溃，请定位并修复，跑通相关测试' }], source: { kind: 'user' } });

  /* ---- Turn 1: analyze ---- */
  w.ev(dt(400), 'turn/start', { turn: 1 });
  w.ev(dt(150), 'step/start', { turn: 1, step: 1 });
  w.ev(dt(80), 'request/header', { header: { config: { provider: 'nothing-llm', model: 'deepseek-v4-flash', maxTokens: 65536 } } });
  w.ev(dt(60), 'request/context', { provider: 'nothing-llm', model: 'deepseek-v4-flash', contextWindow: 1048576 });
  w.ev(dt(120), 'todo/write', { todos: [
    { content: '复现并定位崩溃堆栈', status: 'in_progress' },
    { content: '梳理保存链路调用关系', status: 'pending' },
    { content: '修复空指针并补判空', status: 'pending' },
    { content: '跑通 save/record 相关测试', status: 'pending' },
  ] });
  toolCall(w, dt(300), 1, 1, 'call-bash-stack', 'bash', { command: 'rg -n "Null check error" build/logs/crash-2208.log | head -40', description: '查看崩溃日志' });
  toolCall(w, dt(40), 1, 1, 'call-glob-save', 'glob', { pattern: 'lib/**/save*.dart' });
  toolOk(w, dt(1800), 1, 1, 'call-bash-stack', 'crash-2208.log:112: Null check operator used on a null value\n  #0 DraftSaver.persist (package:napkin/save/draft_saver.dart:128:31)\n  #1 RecordStore.flush (package:napkin/record/store.dart:301:9)');
  toolOk(w, dt(120), 1, 1, 'call-glob-save', 'lib/save/draft_saver.dart\nlib/save/save_queue.dart\nlib/save/draft_repo.dart');
  usageTurn(w, dt(300), 1, 1, 8400, 420, 6100);
  w.ev(dt(90), 'step/end', { turn: 1, step: 1 });

  w.ev(dt(200), 'step/start', { turn: 1, step: 2 });
  w.ev(dt(100), 'request/header', { header: { config: { provider: 'nothing-llm', model: 'deepseek-v4-flash' } } });
  toolCall(w, dt(250), 1, 2, 'call-read-saver', 'read', { file_path: 'lib/save/draft_saver.dart' });
  toolCall(w, dt(30), 1, 2, 'call-read-store', 'read', { file_path: 'lib/record/store.dart' });
  toolOk(w, dt(900), 1, 2, 'call-read-saver', 'class DraftSaver {\n  Future<void> persist(Draft? draft) async {\n    final meta = draft!.meta; // line 128 — draft may be null after GC race\n    await repo.write(meta);\n  }\n}');
  toolOk(w, dt(60), 1, 2, 'call-read-store', 'void flush() { for (final d in queue) saver.persist(d.maybe()); }');
  usageTurn(w, dt(200), 1, 2, 9800, 510, 7200);
  w.ev(dt(80), 'step/end', { turn: 1, step: 2 });

  /* LLM timeout retry inside step 3 */
  w.ev(dt(250), 'step/start', { turn: 1, step: 3 });
  w.ev(dt(400), 'llm/retry', { retryId: 'rt-1', turn: 1, step: 3, provider: 'nothing-llm', mode: 'normal', retry: 1, maxRetries: 6, delayMs: 950, failure: { message: 'Request timed out.', code: 'TIMEOUT' } });
  w.ev(dt(1000), 'llm/retry-started', { retryId: 'rt-1', turn: 1, step: 3, retry: 1 });
  w.ev(dt(300), 'llm/retry', { retryId: 'rt-2', turn: 1, step: 3, provider: 'nothing-llm', mode: 'normal', retry: 2, maxRetries: 6, delayMs: 2100, failure: { message: 'Request timed out.', code: 'TIMEOUT' } });
  w.ev(dt(2200), 'llm/retry-started', { retryId: 'rt-2', turn: 1, step: 3, retry: 2 });
  w.ev(dt(300), 'request/header', { header: { config: { provider: 'nothing-llm', model: 'deepseek-v4-flash' } } });
  toolCall(w, dt(200), 1, 3, 'call-skill-review', 'skill', { name: 'code-review' });
  toolOk(w, dt(2600), 1, 3, 'call-skill-review', 'code-review: 草稿保存在并发清空队列时存在竞态；建议 persist 入参判空 + 队列快照遍历。风险: 中。');
  usageTurn(w, dt(150), 1, 3, 11200, 640, 8100);
  w.ev(dt(80), 'step/end', { turn: 1, step: 3 });

  /* parallel subagents */
  w.ev(dt(300), 'step/start', { turn: 1, step: 4 });
  w.ev(dt(120), 'request/header', { header: { config: { provider: 'nothing-llm', model: 'deepseek-v4-flash' } } });
  toolCall(w, dt(250), 1, 4, 'call-sub-chain', 'subagent', { description: '保存链路调用梳理', prompt: '梳理 DraftSaver/RecordStore/SaveQueue 的完整调用链与生命周期' });
  toolCall(w, dt(30), 1, 4, 'call-sub-callers', 'subagent', { description: '调用方影响面排查', prompt: '找出所有调用 persist/flush 的调用方并评估空指针影响面' });
  usageTurn(w, dt(200), 1, 4, 7600, 380, 5000);
  toolOk(w, dt(24_000), 1, 4, 'call-sub-chain', '调用链: RecordPage.onStop → SaveQueue.enqueue → RecordStore.flush → DraftSaver.persist；队列清空与 flush 并发时 draft 可能为 null。');
  toolOk(w, dt(6_500), 1, 4, 'call-sub-callers', '调用方 3 处：页面退出、自动保存定时器、手动保存按钮；均可在队列竞态下传入 null。');
  w.ev(dt(150), 'step/end', { turn: 1, step: 4 });
  w.ev(dt(200), 'turn/end', { turn: 1, reason: { kind: 'completed' } });

  /* ---- Turn 2: fix + failing tests + final retry loop ---- */
  w.ev(dt(1500), 'turn/start', { turn: 2 });
  w.ev(dt(150), 'step/start', { turn: 2, step: 1 });
  w.ev(dt(100), 'request/header', { header: { config: { provider: 'nothing-llm', model: 'deepseek-v4-flash' } } });
  toolCall(w, dt(200), 2, 1, 'call-edit-saver', 'edit', { file_path: 'lib/save/draft_saver.dart', old_str: 'final meta = draft!.meta;', new_str: 'final meta = draft?.meta;\nif (meta == null) return;' });
  toolCall(w, dt(40), 2, 1, 'call-edit-store', 'edit', { file_path: 'lib/record/store.dart', old_str: 'for (final d in queue) saver.persist(d.maybe());', new_str: 'for (final d in List.of(queue)) saver.persist(d.maybe());' });
  toolOk(w, dt(700), 2, 1, 'call-edit-saver', 'applied 1 edit to lib/save/draft_saver.dart');
  toolOk(w, dt(50), 2, 1, 'call-edit-store', 'applied 1 edit to lib/record/store.dart');
  usageTurn(w, dt(200), 2, 1, 10500, 520, 7900);
  w.ev(dt(80), 'step/end', { turn: 2, step: 1 });

  const TEST_CMD = { command: 'flutter test test/save test/record', description: '跑保存/录音相关测试' };
  w.ev(dt(250), 'step/start', { turn: 2, step: 2 });
  toolCall(w, dt(200), 2, 2, 'call-test-1', 'bash', TEST_CMD);
  toolErr(w, dt(31_000), 2, 2, 'call-test-1', 'test/save/draft_saver_test.dart:42 Expected: completes Actual: threw Null check error\n2 failures, 37 passed', { name: 'TestFailure', code: 'TEST_FAILED' });
  usageTurn(w, dt(150), 2, 2, 6200, 210, 4100);
  w.ev(dt(80), 'step/end', { turn: 2, step: 2 });

  w.ev(dt(300), 'step/start', { turn: 2, step: 3 });
  toolCall(w, dt(250), 2, 3, 'call-test-2', 'bash', TEST_CMD);
  toolErr(w, dt(28_000), 2, 3, 'call-test-2', 'test/save/draft_saver_test.dart:42 still failing: repo.write called on closed repo', { name: 'TestFailure', code: 'TEST_FAILED' });
  toolCall(w, dt(200), 2, 3, 'call-edit-saver2', 'edit', { file_path: 'lib/save/draft_saver.dart', old_str: 'await repo.write(meta);', new_str: 'if (repo.isOpen) await repo.write(meta);' });
  toolOk(w, dt(500), 2, 3, 'call-edit-saver2', 'applied 1 edit to lib/save/draft_saver.dart');
  usageTurn(w, dt(150), 2, 3, 7100, 300, 4800);
  w.ev(dt(80), 'step/end', { turn: 2, step: 3 });

  w.ev(dt(300), 'step/start', { turn: 2, step: 4 });
  toolCall(w, dt(200), 2, 4, 'call-test-3', 'bash', TEST_CMD);
  toolOk(w, dt(26_000), 2, 4, 'call-test-3', 'All tests passed! 39 passed, 0 failures (flutter test test/save test/record)');
  toolCall(w, dt(150), 2, 4, 'call-todo-done', 'todo_write', { todos: [
    { content: '复现并定位崩溃堆栈', status: 'completed' },
    { content: '梳理保存链路调用关系', status: 'completed' },
    { content: '修复空指针并补判空', status: 'completed' },
    { content: '跑通 save/record 相关测试', status: 'completed' },
  ] });
  toolOk(w, dt(60), 2, 4, 'call-todo-done', 'Updated 4 todo items');
  usageTurn(w, dt(150), 2, 4, 5900, 260, 3900);
  w.ev(dt(80), 'step/end', { turn: 2, step: 4 });
  w.ev(dt(200), 'turn/end', { turn: 2, reason: { kind: 'completed' } });

  return w;
}

/* child (subagent) sessions for task 1 */
export function bugfixChildren() {
  const P = 1_787_600_000_000;
  const mk = (id, createdAt, label, dur) => {
    const header = { type: 'session', version: 0, id, createdAt, cwd: '/Users/dev/Napkin', parentSession: 'demo-bugfix-NIS-11688', origin: 'subagent', delegationDepth: 1 };
    const w = makeWriter(header);
    let t = createdAt + 200;
    w.ev(t, 'session/title', { title: label });
    w.ev(t += 150, 'subagent/descriptor', { version: 2, mode: 'one-shot', provider: 'spawn', label });
    w.ev(t += 120, 'turn/start', { turn: 1 });
    w.ev(t += 100, 'step/start', { turn: 1, step: 1 });
    toolCall(w, t += 150, 1, 1, `${id}-grep`, 'grep', { pattern: 'persist|flush', path: 'lib' });
    toolOk(w, t += Math.floor(dur * 0.5), 1, 1, `${id}-grep`, 'lib/save/draft_saver.dart:128\nlib/record/store.dart:301');
    toolCall(w, t += 200, 1, 1, `${id}-read`, 'read', { file_path: 'lib/save/draft_saver.dart' });
    toolOk(w, t += Math.floor(dur * 0.35), 1, 1, `${id}-read`, 'class DraftSaver { ... }');
    usageTurn(w, t += 100, 1, 1, 4200, 320, 2600);
    w.ev(t += 150, 'step/end', { turn: 1, step: 1 });
    w.ev(t += 120, 'turn/end', { turn: 1, reason: { kind: 'completed' } });
    return w;
  };
  return [
    mk('demo-child-chain', P + 30_000, '保存链路调用梳理', 22_000),
    mk('demo-child-callers', P + 30_400, '调用方影响面排查', 28_000),
  ];
}

/* ------------------------------------------------------------------ */
/* Task 2: failed deployment (error localization demo)                */
/* ------------------------------------------------------------------ */
export function failedDeployTask() {
  const T0 = 1_787_690_000_000;
  const header = { type: 'session', version: 0, id: 'demo-deploy-rollback', createdAt: T0, cwd: '/Users/dev/nothing_link_package', delegationDepth: 0 };
  const w = makeWriter(header);
  let t = T0 + 300;
  const dt = (ms) => (t += ms);

  w.ev(t, 'session/title', { title: 'Link 2.4.1 热修发布：回滚失败' });
  w.ev(dt(200), 'user/message', { id: 'm1', role: 'user', content: [{ type: 'text', text: '把 Link 2.4.1 热修包推上灰度，失败就回滚' }], source: { kind: 'user' } });
  w.ev(dt(300), 'turn/start', { turn: 1 });
  w.ev(dt(120), 'step/start', { turn: 1, step: 1 });
  toolCall(w, dt(200), 1, 1, 'call-git-status', 'bash', { command: 'git status && git log --oneline -3', description: '确认仓库状态' });
  toolOk(w, dt(900), 1, 1, 'call-git-status', 'On branch release/2.4.1\na1b2c3d hotfix: reconnect crash\nf4e5d6c chore: bump 2.4.1');
  usageTurn(w, dt(100), 1, 1, 5200, 180, 3900);
  w.ev(dt(80), 'step/end', { turn: 1, step: 1 });

  w.ev(dt(200), 'step/start', { turn: 1, step: 2 });
  toolCall(w, dt(150), 1, 2, 'call-deploy', 'bash', { command: './scripts/gray_release.sh --channel gray --version 2.4.1', description: '推灰度' });
  toolErr(w, dt(18_000), 1, 2, 'call-deploy', 'ERROR: artifact signed check failed: cert chain expired at 2026-08-20\ngray_release exit 3', { name: 'DeployError', code: 'CERT_EXPIRED' });
  usageTurn(w, dt(120), 1, 2, 6100, 240, 4400);
  w.ev(dt(80), 'step/end', { turn: 1, step: 2 });

  w.ev(dt(250), 'step/start', { turn: 1, step: 3 });
  toolCall(w, dt(150), 1, 3, 'call-deploy-2', 'bash', { command: './scripts/gray_release.sh --channel gray --version 2.4.1', description: '重试推灰度' });
  toolErr(w, dt(16_000), 1, 3, 'call-deploy-2', 'ERROR: artifact signed check failed: cert chain expired\ngray_release exit 3', { name: 'DeployError', code: 'CERT_EXPIRED' });
  toolCall(w, dt(200), 1, 3, 'call-rollback', 'bash', { command: './scripts/rollback.sh --channel gray', description: '回滚灰度' });
  toolErr(w, dt(7_000), 1, 3, 'call-rollback', 'rollback failed: no previous gray artifact found (first release of this channel)', { name: 'RollbackError', code: 'NO_PREVIOUS' });
  usageTurn(w, dt(120), 1, 3, 7400, 320, 5100);
  w.ev(dt(80), 'step/end', { turn: 1, step: 3 });
  w.ev(dt(200), 'turn/end', { turn: 1, reason: { kind: 'error', error: { message: '签名证书过期导致灰度发布与回滚均失败', code: 'CERT_EXPIRED' } } });

  return w;
}

/* ------------------------------------------------------------------ */
/* Task 3: live script (replayed by the demo server)                  */
/* ------------------------------------------------------------------ */
export function liveTriageScript() {
  const T0 = Date.now() - 60_000;
  const header = { type: 'session', version: 0, id: 'demo-live-triage', createdAt: T0, cwd: '/Users/dev/api-gateway', delegationDepth: 0 };
  const w = makeWriter(header);
  let t = T0;
  const dt = (ms) => (t += ms);

  const script = [];
  const take = (ev) => script.push(ev);
  const wrap = (fn) => {
    const before = w.events.length;
    fn();
    for (let i = before; i < w.events.length; i += 1) take(w.events[i]);
  };

  wrap(() => w.ev(dt(300), 'session/title', { title: '实时排查：订单接口超时' }));
  wrap(() => w.ev(dt(400), 'user/message', { id: 'lm1', role: 'user', content: [{ type: 'text', text: '线上 /api/order/list P99 超时 3s，帮我定位' }], source: { kind: 'user' } }));
  wrap(() => w.ev(dt(500), 'turn/start', { turn: 1 }));
  wrap(() => w.ev(dt(200), 'step/start', { turn: 1, step: 1 }));
  wrap(() => w.ev(dt(150), 'request/header', { header: { config: { provider: 'nothing-llm', model: 'deepseek-v4-flash' } } }));
  wrap(() => toolCall(w, dt(300), 1, 1, 'lc-bash-metrics', 'bash', { command: 'curl -s prom:9090/query?q=http_p99{path="/api/order/list"}', description: '查询 P99 指标' }));
  wrap(() => toolOk(w, dt(1200), 1, 1, 'lc-bash-metrics', 'http_p99{path="/api/order/list"} 3.2s (5m window)'));
  wrap(() => toolCall(w, dt(200), 1, 1, 'lc-grep-handler', 'grep', { pattern: 'order/list', path: 'src/routes' }));
  wrap(() => toolOk(w, dt(800), 1, 1, 'lc-grep-handler', 'src/routes/order.ts:88 router.get("/api/order/list", handler)'));
  wrap(() => usageTurn(w, dt(200), 1, 1, 4100, 220, 2600));
  wrap(() => w.ev(dt(100), 'step/end', { turn: 1, step: 1 }));

  wrap(() => w.ev(dt(300), 'step/start', { turn: 1, step: 2 }));
  wrap(() => toolCall(w, dt(200), 1, 2, 'lc-read-handler', 'read', { file_path: 'src/routes/order.ts' }));
  wrap(() => toolOk(w, dt(900), 1, 2, 'lc-read-handler', 'handler: const orders = await db.query("SELECT * FROM orders WHERE uid=$1", [uid]); // no LIMIT, no index hint'));
  wrap(() => toolCall(w, dt(200), 1, 2, 'lc-bash-sql', 'bash', { command: 'psql -c "EXPLAIN ANALYZE SELECT * FROM orders WHERE uid=1001"', description: '看执行计划' }));
  wrap(() => toolOk(w, dt(2600), 1, 2, 'lc-bash-sql', 'Seq Scan on orders (cost=0..84123 rows=28411) — index idx_orders_uid NOT used'));
  wrap(() => usageTurn(w, dt(200), 1, 2, 5300, 300, 3300));
  wrap(() => w.ev(dt(100), 'step/end', { turn: 1, step: 2 }));

  wrap(() => w.ev(dt(300), 'step/start', { turn: 1, step: 3 }));
  wrap(() => toolCall(w, dt(200), 1, 3, 'lc-edit-sql', 'edit', { file_path: 'src/routes/order.ts', old_str: 'SELECT * FROM orders WHERE uid=$1', new_str: 'SELECT id,status,total,created_at FROM orders WHERE uid=$1 ORDER BY created_at DESC LIMIT 50' }));
  wrap(() => toolOk(w, dt(700), 1, 3, 'lc-edit-sql', 'applied 1 edit to src/routes/order.ts'));
  wrap(() => toolCall(w, dt(200), 1, 3, 'lc-test', 'bash', { command: 'npm test -- order.test.ts', description: '跑回归' }));
  wrap(() => toolErr(w, dt(5200), 1, 3, 'lc-test', 'order.test.ts:31 expected full order object, got projected columns', { name: 'TestFailure', code: 'TEST_FAILED' }));
  wrap(() => toolCall(w, dt(250), 1, 3, 'lc-edit-test', 'edit', { file_path: 'test/order.test.ts', old_str: 'expect(order).toHaveProperty("raw")', new_str: 'expect(order).toHaveProperty("id")' }));
  wrap(() => toolOk(w, dt(600), 1, 3, 'lc-edit-test', 'applied 1 edit to test/order.test.ts'));
  wrap(() => toolCall(w, dt(200), 1, 3, 'lc-test-2', 'bash', { command: 'npm test -- order.test.ts', description: '跑回归' }));
  wrap(() => toolOk(w, dt(4800), 1, 3, 'lc-test-2', 'PASS order.test.ts (12 tests)'));
  wrap(() => usageTurn(w, dt(200), 1, 3, 6100, 350, 3900));
  wrap(() => w.ev(dt(100), 'step/end', { turn: 1, step: 3 }));
  wrap(() => w.ev(dt(250), 'turn/end', { turn: 1, reason: { kind: 'completed' } }));

  return { header, script };
}

/* ------------------------------------------------------------------ */
/* In-memory store compatible with lib/routes.js createApi()          */
/* ------------------------------------------------------------------ */
export function createDemoStore() {
  const b = bugfixTask();
  const children = bugfixChildren();
  const f = failedDeployTask();
  const live = liveTriageScript();

  const liveState = { pointer: 3, timer: null, startedAt: Date.now() };

  const items = [
    { ref: 'demo/demo-bugfix-NIS-11688', header: b.header, events: b.events, info: { workspace: 'demo', dir: 'demo-bugfix-NIS-11688', path: 'mem://1', size: 1024, mtime: b.events[b.events.length - 1].time } },
    { ref: 'demo/demo-deploy-rollback', header: f.header, events: f.events, info: { workspace: 'demo', dir: 'demo-deploy-rollback', path: 'mem://2', size: 1024, mtime: f.events[f.events.length - 1].time } },
  ];
  const childItems = children.map((c, i) => ({
    ref: `demo/${c.header.id}`, header: c.header, events: c.events, info: { workspace: 'demo', dir: c.header.id, path: `mem://c${i}`, size: 512, mtime: c.events[c.events.length - 1].time },
  }));
  const liveItem = { ref: 'demo/demo-live-triage', header: live.header, events: [live.header, ...live.script.slice(0, 3)], info: { workspace: 'demo', dir: 'demo-live-triage', path: 'mem://live', size: 1, mtime: Date.now() } };

  const all = [...items, ...childItems, liveItem];

  const store = {
    home: '(demo data)',
    all: () => all,
    load: (ref) => all.find((i) => i.ref === ref) ?? null,
    childrenOf: (id) => childItems.filter((c) => c.header.parentSession === id),
    artifactInfo: () => null,
  };

  /** advance the live script by n events (called by the server ticker) */
  store.tickLive = (n = 1) => {
    for (let i = 0; i < n && liveState.pointer < live.script.length; i += 1) {
      const ev = live.script[liveState.pointer];
      liveItem.events.push(ev);
      liveState.pointer += 1;
    }
    liveItem.info.mtime = Date.now();
    return liveState.pointer < live.script.length;
  };
  store.liveDone = () => liveState.pointer >= live.script.length;
  store.liveRef = liveItem.ref;
  return store;
}
