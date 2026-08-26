/**
 * Standalone demo server for dsh-task-graph — zero dependencies.
 *
 *   npm run demo            → scripted demo data (works without DSH)
 *   npm run demo -- --real  → your real DSH_HOME sessions instead
 *   npm run demo -- --port 8123
 *
 * Serves the same HTTP API the DSH plugin mounts (lib/routes.js) plus a
 * static demo page that loads lib/client.js as a plain script.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi, sendJson, startLiveStream } from '../lib/routes.js';
import { createDemoStore } from './sample-events.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const REAL = args.includes('--real');
const PORT = Number(args[args.indexOf('--port') + 1] ?? 4173);

let store;
if (REAL) {
  const { SessionStore, resolveDshHome } = await import('../lib/sessions.js');
  store = new SessionStore(resolveDshHome());
  console.log(`[demo] using REAL sessions from ${store.home}`);
} else {
  store = createDemoStore();
  console.log('[demo] using scripted demo data (use --real for your DSH sessions)');
  // replay the live task event by event
  setInterval(() => {
    const more = store.tickLive(1);
    if (!more && store.liveDone()) { /* finished; ticks keep reporting done */ }
  }, 900);
}

const api = createApi(store);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
};

function serveFile(res, path) {
  if (!path.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  if (!existsSync(path)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  const body = readFileSync(path);
  res.writeHead(200, {
    'content-type': MIME[extname(path)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  res.end(body);
}

const server = createServer((req, res) => {
  // demo-only CORS: lets the client be injected into another origin (e.g. a
  // running DSH web UI during development) without touching plugin code.
  const origWriteHead = res.writeHead.bind(res);
  res.writeHead = (status, ...rest) => {
    const headers = rest.length > 0 && typeof rest[rest.length - 1] === 'object' ? rest[rest.length - 1] : {};
    headers['access-control-allow-origin'] ??= '*';
    if (rest.length === 0) return origWriteHead(status, headers);
    rest[rest.length - 1] = headers;
    return origWriteHead(status, ...rest);
  };
  let url;
  try {
    url = new URL(req.url ?? '/', 'http://localhost');
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  const route = url.pathname;
  const query = Object.fromEntries(url.searchParams.entries());

  if (route.startsWith('/task-graph/api/')) {
    try {
      switch (route) {
        case '/task-graph/api/status': return sendJson(res, 200, api.status());
        case '/task-graph/api/tasks': return sendJson(res, 200, api.tasks(query));
        case '/task-graph/api/task': return sendJson(res, 200, api.task(query));
        case '/task-graph/api/events': return sendJson(res, 200, api.events(query));
        case '/task-graph/api/event': return sendJson(res, 200, api.event(query));
        case '/task-graph/api/live': return startLiveStream(api, store, query, req, res);
        default: return sendJson(res, 404, { error: `unknown ${route}` });
      }
    } catch (error) {
      return sendJson(res, 500, { error: error?.message ?? String(error) });
    }
  }

  if (route === '/' || route === '/index.html') return serveFile(res, join(__dirname, 'index.html'));
  if (route.startsWith('/lib/')) return serveFile(res, join(ROOT, route));
  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[demo] task graph demo running → http://127.0.0.1:${PORT}`);
});
