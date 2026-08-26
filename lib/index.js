/**
 * dsh-task-graph host entry: mounts the Task Graph HTTP API on the DSH
 * `webServer` service once the profile composes it. Client UI is served
 * automatically by @deepseek-ai/dsh-client-modules through the `dsh.client`
 * declaration in package.json (`/plugins/<id>/client.js`).
 *
 * @module dsh-task-graph
 */

import { SessionStore, resolveDshHome, zstdSupported } from './sessions.js';
import { createApi, sendJson, startLiveStream, PLUGIN_NAME, PLUGIN_VERSION } from './routes.js';

export const name = 'task-graph';

/**
 * Register the plugin against the host context.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{dshHome?: string}} [config] - optional profile config override.
 */
export function apply(ctx, config) {
  ctx.inject(['webServer'], (hostCtx) => {
    const host = hostCtx;
    host.effect(() => {
      const home = config?.dshHome ? String(config.dshHome) : resolveDshHome();
      const store = new SessionStore(home);
      const api = createApi(store);
      const logger = host.logger;
      if (!zstdSupported()) {
        logger?.warn?.(`[${PLUGIN_NAME}] this Node lacks native zstd support (need ≥ 22.15); sessions cannot be decoded`);
      }
      const dispose = host.webServer.register({
        kind: 'prefix',
        path: '/task-graph',
        handler: async (req, res) => {
          let url;
          try {
            url = new URL(req.url ?? '/', 'http://localhost');
          } catch {
            sendJson(res, 400, { error: 'bad url' });
            return;
          }
          const route = url.pathname;
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            sendJson(res, 405, { error: 'task-graph is read-only' });
            return;
          }
          const query = Object.fromEntries(url.searchParams.entries());
          try {
            switch (route) {
              case '/task-graph/api/status':
                sendJson(res, 200, api.status());
                return;
              case '/task-graph/api/tasks':
                sendJson(res, 200, api.tasks(query));
                return;
              case '/task-graph/api/task':
                sendJson(res, 200, api.task(query));
                return;
              case '/task-graph/api/events':
                sendJson(res, 200, api.events(query));
                return;
              case '/task-graph/api/event':
                sendJson(res, 200, api.event(query));
                return;
              case '/task-graph/api/live':
                startLiveStream(api, store, query, req, res);
                return;
              case '/task-graph':
              case '/task-graph/':
                sendJson(res, 200, { plugin: PLUGIN_NAME, version: PLUGIN_VERSION, hint: 'UI is embedded in the DSH web app; API under /task-graph/api/*' });
                return;
              default:
                sendJson(res, 404, { error: `unknown route ${route}` });
            }
          } catch (error) {
            logger?.error?.(`[${PLUGIN_NAME}] ${route} failed: ${error?.stack ?? error}`);
            sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
          }
        },
      });
      logger?.info?.(`[${PLUGIN_NAME}] task flow graph API mounted at /task-graph/api/* (home: ${home})`);
      return dispose;
    }, `${PLUGIN_NAME}: http routes`);
  });
}
