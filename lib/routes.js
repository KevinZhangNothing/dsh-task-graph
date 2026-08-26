/**
 * dsh-task-graph HTTP API. Framework-neutral request handling so the same
 * logic serves both the DSH `webServer` routes (lib/index.js) and the
 * standalone demo server (demo/server.mjs).
 *
 * Endpoints (all GET, all JSON unless noted):
 *   /task-graph/api/status                     → plugin health
 *   /task-graph/api/tasks                      → task list (sessions)
 *   /task-graph/api/task?id=<ref>              → full Task Flow Graph
 *   /task-graph/api/events?id=<ref>            → compact trajectory events
 *   /task-graph/api/event?id=<ref>&seq=<n>     → one full event payload
 *   /task-graph/api/live?id=<ref>              → SSE live tail
 *
 * @module dsh-task-graph/routes
 */

import { buildGraph } from './graph.js';
import { criticalPath } from './analytics.js';
import { displaySessionId, workspacePath } from './sessions.js';

export const PLUGIN_NAME = 'dsh-task-graph';
export const PLUGIN_VERSION = '0.1.0';

/* ------------------------------------------------------------------ */
/* Lightweight per-session stats (task list)                           */
/* ------------------------------------------------------------------ */

function firstTextOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string') return block.text;
  }
  return '';
}

/** Heuristic: a session is live when recently touched with an unclosed turn/step. */
export function detectLive(events, mtimeMs, now = Date.now()) {
  if (now - mtimeMs > 180_000) return false;
  let open = false;
  for (const ev of events) {
    switch (ev.type) {
      case 'turn/start':
      case 'step/start':
        open = true;
        break;
      case 'turn/end':
      case 'step/end':
        open = false;
        break;
      default:
        break;
    }
  }
  return open;
}

/** Quick aggregate used for the task list and child-session badges. */
export function quickStats(events) {
  let turns = 0;
  let steps = 0;
  let tools = 0;
  let errors = 0;
  let retries = 0;
  let tokens = 0;
  let title = null;
  let userRequest = null;
  let lastReason = null;
  let startTime = null;
  let endTime = null;
  let label = null;
  let lastErrorAt = -Infinity;
  let lastOkAt = -Infinity;
  for (const ev of events) {
    const t = ev.time;
    if (typeof t === 'number') {
      if (startTime === null) startTime = t;
      endTime = t;
    }
    switch (ev.type) {
      case 'session/title':
        title = ev.data?.title ?? title;
        break;
      case 'subagent/descriptor':
        label = ev.data?.label ?? label;
        break;
      case 'turn/start':
        turns += 1;
        break;
      case 'turn/end':
        lastReason = ev.data?.reason ?? null;
        if (lastReason?.kind === 'completed') lastOkAt = Math.max(lastOkAt, t ?? 0);
        else if (lastReason?.kind === 'error') lastErrorAt = Math.max(lastErrorAt, t ?? 0);
        break;
      case 'step/start':
        steps += 1;
        break;
      case 'step/end':
        lastOkAt = Math.max(lastOkAt, t ?? 0);
        break;
      case 'tool/call':
        tools += 1;
        break;
      case 'tool/result': {
        const block = ev.data?.message?.content?.[0];
        if (block?.isError === true || ev.data?.error !== undefined) {
          errors += 1;
          lastErrorAt = Math.max(lastErrorAt, t ?? 0);
        } else {
          lastOkAt = Math.max(lastOkAt, t ?? 0);
        }
        break;
      }
      case 'llm/retry':
        retries += 1;
        break;
      case 'user/message':
        if (userRequest === null) userRequest = firstTextOf(ev.data?.content).slice(0, 120);
        break;
      case 'assistant/chunk': {
        const u = ev.data?.chunk;
        if (u?.type === 'usage' && u.usage) tokens += (u.usage.inputTokens ?? 0) + (u.usage.outputTokens ?? 0);
        break;
      }
      default:
        break;
    }
  }
  return { turns, steps, tools, errors, retries, tokens, title, userRequest, label, lastReason, startTime, endTime, lastErrorAt, lastOkAt };
}

/* ------------------------------------------------------------------ */
/* API implementation over a store                                     */
/* ------------------------------------------------------------------ */

/**
 * Create the API handler set over a session store.
 *
 * @param {object} store - object implementing SessionStore's surface:
 *   all(), load(ref), childrenOf(sessionId), artifactInfo(ref), home.
 */
export function createApi(store) {
  function taskEntry(item) {
    const { ref, header, info, events } = item;
    const stats = quickStats(events);
    const live = detectLive(events, info.mtime);
    const id = displaySessionId(info.dir);
    const lastKind = stats.lastReason?.kind;
    const unrecovered = stats.lastErrorAt > stats.lastOkAt;
    const status = live ? 'RUNNING'
      : lastKind === 'error' || unrecovered ? 'FAILED'
        : lastKind === 'aborted' ? 'CANCELLED'
          : 'SUCCESS';
    return {
      ref,
      id,
      workspace: info.workspace,
      workspace_path: workspacePath(info.workspace),
      title: stats.title ?? stats.label ?? stats.userRequest ?? id,
      label: stats.label ?? null,
      status,
      createdAt: header?.createdAt ?? stats.startTime,
      endTime: stats.endTime,
      duration_ms: stats.startTime != null && stats.endTime != null ? Math.max(0, stats.endTime - stats.startTime) : null,
      live,
      depth: header?.delegationDepth ?? 0,
      parent: header?.parentSession ?? null,
      cwd: header?.cwd ?? null,
      size: info.size,
      counts: {
        turns: stats.turns,
        steps: stats.steps,
        tools: stats.tools,
        errors: stats.errors,
        retries: stats.retries,
      },
      tokens_total: stats.tokens,

    };
  }

  function childSummary(item) {
    const stats = quickStats(item.events);
    const id = displaySessionId(item.info.dir);
    return {
      id,
      ref: item.ref,
      title: stats.title ?? stats.label ?? stats.userRequest ?? id,
      createdAt: item.header?.createdAt ?? stats.startTime,
      endTime: stats.endTime,
      status: stats.lastReason?.kind === 'error' ? 'FAILED' : stats.lastReason?.kind === 'aborted' ? 'CANCELLED' : 'SUCCESS',
      depth: item.header?.delegationDepth ?? 0,
      counts: { turns: stats.turns, steps: stats.steps, tools: stats.tools, errors: stats.errors },
    };
  }

  const api = {
    status() {
      return {
        ok: true,
        plugin: PLUGIN_NAME,
        version: PLUGIN_VERSION,
        home: store.home,
        zstd: typeof globalThis.process !== 'undefined',
      };
    },

    tasks(query = {}) {
      const items = store.all();
      let entries = items.filter((it) => it.header).map(taskEntry);
      const q = String(query.q ?? '').toLowerCase();
      if (q) {
        entries = entries.filter((e) => `${e.title} ${e.id} ${e.workspace}`.toLowerCase().includes(q));
      }
      if (query.roots !== 'false') entries = entries.filter((e) => e.depth === 0);
      entries.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      const limit = Math.min(Number(query.limit ?? 100) || 100, 500);
      return { tasks: entries.slice(0, limit), total: entries.length };
    },

    task(query = {}) {
      const ref = String(query.id ?? '');
      const loaded = store.load(ref);
      if (!loaded) return { error: `unknown task: ${ref}` };
      const children = store.childrenOf(loaded.header.id ?? '').map(childSummary);
      const live = detectLive(loaded.events, loaded.info.mtime);
      const graph = buildGraph(loaded.events, {
        header: loaded.header,
        live,
        children,
        workspace: loaded.info.workspace,
      });
      graph.critical_path = criticalPath(graph);
      return graph;
    },

    events(query = {}) {
      const ref = String(query.id ?? '');
      const loaded = store.load(ref);
      if (!loaded) return { error: `unknown task: ${ref}` };
      const from = Number(query.from ?? 0) || 0;
      const compact = [];
      for (const ev of loaded.events) {
        if (ev.type === 'session') continue;
        if (typeof ev.seq === 'number' && ev.seq < from) continue;
        compact.push(compactEvent(ev));
      }
      return { count: compact.length, events: compact };
    },

    event(query = {}) {
      const ref = String(query.id ?? '');
      const seq = Number(query.seq);
      const loaded = store.load(ref);
      if (!loaded) return { error: `unknown task: ${ref}` };
      const ev = loaded.events.find((e) => e.seq === seq);
      if (!ev) return { error: `unknown event seq=${seq}` };
      return ev;
    },
  };

  function compactEvent(ev) {
    const d = ev.data ?? {};
    let summary = '';
    switch (ev.type) {
      case 'turn/start': summary = `Turn ${d.turn}`; break;
      case 'turn/end': summary = `turn ${d.turn} ${d.reason?.kind ?? ''}`; break;
      case 'step/start': summary = `step ${d.turn}.${d.step}`; break;
      case 'step/end': summary = `step ${d.turn}.${d.step} done`; break;
      case 'tool/call': summary = `${d.name}(${truncArgs(d.arguments)})`; break;
      case 'tool/result': {
        const block = d.message?.content?.[0];
        const isErr = block?.isError === true || d.error !== undefined;
        summary = `${isErr ? '✗' : '✓'} ${truncText(firstTextOf(block?.content ?? d.message?.content), 100)}`;
        break;
      }
      case 'llm/retry': summary = `retry #${d.retry}/${d.maxRetries}: ${d.failure?.code ?? ''} ${d.failure?.message ?? ''}`; break;
      case 'llm/retry-started': summary = `retry #${d.retry} started`; break;
      case 'todo/write': summary = `todos: ${(d.todos ?? []).length}`; break;
      case 'user/message': summary = truncText(firstTextOf(d.content), 120); break;
      case 'assistant/message': summary = 'assistant message'; break;
      case 'session/title': summary = String(d.title ?? ''); break;
      case 'subagent/descriptor': summary = String(d.label ?? 'subagent'); break;
      case 'approval/policy': summary = `policy=${d.policy}`; break;
      case 'sandbox/mode': summary = `sandbox=${d.mode}`; break;
      default: summary = ev.type; break;
    }
    let payload;
    try {
      payload = JSON.stringify(d);
    } catch {
      payload = '';
    }
    const truncated = payload.length > 1500;
    return {
      seq: ev.seq,
      time: ev.time,
      type: ev.type,
      summary,
      truncated,
      data: truncated ? `${payload.slice(0, 1500)}…` : d,
    };
  }

  function truncArgs(raw) {
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }

  function truncText(text, n) {
    const one = String(text ?? '').replace(/\s+/g, ' ').trim();
    return one.length > n ? `${one.slice(0, n)}…` : one;
  }

  return api;
}

/* ------------------------------------------------------------------ */
/* HTTP plumbing helpers                                               */
/* ------------------------------------------------------------------ */

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(body);
}

/**
 * SSE live tail: poll the session artifact and emit newly appended events.
 * Works over any req/res pair (node:http). Returns a disposer.
 */
export function startLiveStream(api, store, query, req, res, { pollMs = 1200 } = {}) {
  const ref = String(query.id ?? '');
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write(`: connected ${ref}\n\n`);

  let seen = store.load(ref)?.events.length ?? 0;
  let closed = false;
  const send = (eventName, payload) => {
    if (closed) return;
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
  };
  const timer = setInterval(() => {
    if (closed) return;
    const loaded = store.load(ref);
    if (!loaded) {
      send('error', { error: 'task gone' });
      dispose();
      return;
    }
    if (loaded.events.length > seen) {
      const fresh = loaded.events.slice(seen).map((ev) => ({ seq: ev.seq, type: ev.type, time: ev.time }));
      seen = loaded.events.length;
      send('events', { new: fresh.length, total: seen, events: fresh });
    }
    send('tick', { total: seen, live: detectLive(loaded.events, loaded.info.mtime), at: Date.now() });
  }, pollMs);
  const heartbeat = setInterval(() => {
    if (!closed) res.write(': hb\n\n');
  }, 15_000);

  function dispose() {
    closed = true;
    clearInterval(timer);
    clearInterval(heartbeat);
    try {
      res.end();
    } catch {
      /* already closed */
    }
  }
  req.on('close', dispose);
  return dispose;
}
