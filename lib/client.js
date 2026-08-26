/**
 * dsh-task-graph client UI — Task Flow / Execution Graph for one DSH task.
 *
 * Zero client dependencies: plain DOM + SVG. Loaded either by the DSH
 * client-module system (`window.__ModuleLoader__`) inside the official web
 * UI, or as a bare <script> by the standalone demo page.
 *
 * Design principles (spec §17): Task First · Graph First · Detail on Demand ·
 * Trajectory as the underlying data · real agent execution, not a static map.
 */
(function () {
  'use strict';

  function factory() {
    if (typeof document === 'undefined') return {};
    if (document.querySelector('[data-dsh-taskgraph-view]')) return {}; // mount-once

    /* ================================================================ *
     * Styles — theme-aware: DSH design tokens when present, fallbacks  *
     * otherwise (standalone demo). All class names are tg-prefixed.    *
     * ================================================================ */
    const CSS = `
[data-dsh-taskgraph-entry]{box-sizing:border-box;width:100%;height:36px;color:var(--dsw-alias-label-secondary,#8b949e);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 10px;font-size:13px;display:flex;font-family:inherit}
[data-dsh-taskgraph-entry]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(120,130,150,.12));color:var(--dsw-alias-label-primary,#e6edf3)}
[data-dsh-taskgraph-entry][data-active]{background:var(--dsw-alias-interactive-bg-active,rgba(120,130,150,.2));color:var(--dsw-alias-label-primary,#e6edf3);font-weight:600}
.tg-entryIcon{flex:none;justify-content:center;align-items:center;width:24px;height:24px;display:inline-flex}
.tg-entryIcon svg{width:18px;height:18px;display:block}
.tg-entryLabel{text-overflow:ellipsis;overflow:hidden}
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-taskgraph-entry]{border-radius:50%;justify-content:center;width:36px;height:36px;margin:0 auto 12px;padding:0}
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-taskgraph-entry] .tg-entryLabel{display:none}

[data-pane=conversation],[class*=centerCol]{position:relative}
[data-dsh-taskgraph-view]{z-index:60;display:none;position:absolute;inset:0;container:tg-view/inline-size}
html[data-dsh-taskgraph-active] [data-dsh-taskgraph-view]{display:flex}
html[data-dsh-taskgraph-active] [data-pane=conversation]>:not([data-dsh-taskgraph-view]),
html[data-dsh-taskgraph-active] [class*=centerCol]>:not([data-dsh-taskgraph-view]){display:none!important}
[data-dsh-taskgraph-view].tg-standalone{position:fixed;inset:0;display:flex}

[data-dsh-taskgraph-view]{
  --tg-bg:var(--dsw-alias-bg-base,#0d1117);
  --tg-bg2:var(--dsw-alias-bg-layer-2,#151b23);
  --tg-bg3:var(--dsw-alias-interactive-bg-hover,rgba(120,130,150,.12));
  --tg-border:var(--dsw-alias-border-l2,#2d333b);
  --tg-border2:var(--dsw-alias-border-l3,#3d444d);
  --tg-text:var(--dsw-alias-label-primary,#e6edf3);
  --tg-text2:var(--dsw-alias-label-secondary,#9aa4b2);
  --tg-text3:var(--dsw-alias-label-tertiary,#6e7681);
  --tg-accent:var(--dsw-alias-state-business-primary,#4c8dff);
  --tg-ok:var(--dsw-alias-state-success-primary,#2fbf71);
  --tg-err:var(--dsw-alias-state-error-primary,#f0475a);
  --tg-warn:var(--dsw-alias-state-warn-primary,#e8a33d);
  --tg-cancel:#a78bfa;
  --tg-input:var(--dsw-specific-input-major,#0d1117);
  --tg-font:var(--dsw-font-family,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif);
  --tg-mono:var(--dsw-font-markdown-code-block-small,ui-monospace,SFMono-Regular,Menlo,monospace);
  background:var(--tg-bg);color:var(--tg-text);font-family:var(--tg-font);
  flex-direction:column;min-width:0;min-height:0;overflow:hidden;
}
.tg-top{flex:none;border-bottom:1px solid var(--tg-border);display:flex;flex-direction:column}
.tg-toprow{display:flex;align-items:center;gap:10px;padding:8px 12px;flex-wrap:wrap}
.tg-title{font-size:14px;font-weight:700;display:flex;align-items:center;gap:8px;white-space:nowrap}
.tg-title svg{width:18px;height:18px;color:var(--tg-accent)}
.tg-select{color:var(--tg-text);background:var(--tg-input);border:1px solid var(--tg-border);border-radius:8px;outline:none;font-size:13px;padding:5px 10px;max-width:340px;font-family:inherit}
.tg-search{color:var(--tg-text);background:var(--tg-input);border:1px solid var(--tg-border);border-radius:8px;outline:none;font-size:13px;padding:5px 10px;flex:0 1 220px;min-width:120px;font-family:inherit}
.tg-search:focus,.tg-select:focus{border-color:var(--tg-accent)}
.tg-search::placeholder{color:var(--tg-text3)}
.tg-btn{color:var(--tg-text2);background:0 0;border:1px solid var(--tg-border);cursor:pointer;border-radius:8px;padding:5px 10px;font-size:12px;font-family:inherit;white-space:nowrap;display:inline-flex;align-items:center;gap:5px}
.tg-btn:hover{background:var(--tg-bg3);color:var(--tg-text)}
.tg-btn[data-on]{color:var(--tg-accent);border-color:var(--tg-accent)}
.tg-btn:disabled{opacity:.45;cursor:default}
.tg-seg{display:inline-flex;border:1px solid var(--tg-border);border-radius:8px;overflow:hidden}
.tg-seg .tg-btn{border:none;border-radius:0}
.tg-seg .tg-btn+.tg-btn{border-left:1px solid var(--tg-border)}
.tg-seg .tg-btn[data-on]{background:var(--tg-bg3)}
.tg-spacer{flex:1}
.tg-badge{border-radius:999px;padding:2px 9px;font-size:11px;font-weight:700;border:1px solid;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.tg-badge .tg-dot{width:7px;height:7px;border-radius:50%;background:currentColor}
.tg-badge[data-status=RUNNING]{color:var(--tg-accent);border-color:var(--tg-accent)}
.tg-badge[data-status=RUNNING] .tg-dot{animation:tgBlink 1.1s ease-in-out infinite}
.tg-badge[data-status=SUCCESS]{color:var(--tg-ok);border-color:var(--tg-ok)}
.tg-badge[data-status=FAILED]{color:var(--tg-err);border-color:var(--tg-err)}
.tg-badge[data-status=RETRYING]{color:var(--tg-warn);border-color:var(--tg-warn)}
.tg-badge[data-status=CANCELLED]{color:var(--tg-cancel);border-color:var(--tg-cancel)}
.tg-badge[data-status=PENDING],.tg-badge[data-status=SKIPPED]{color:var(--tg-text3);border-color:var(--tg-border2)}
@keyframes tgBlink{0%,100%{opacity:1}50%{opacity:.25}}

.tg-summary{display:flex;gap:8px;padding:6px 12px 10px;flex-wrap:wrap;align-items:center}
.tg-chip{background:var(--tg-bg2);border:1px solid var(--tg-border);border-radius:8px;padding:3px 10px;font-size:12px;color:var(--tg-text2);white-space:nowrap}
.tg-chip b{color:var(--tg-text);font-weight:600}
.tg-chip.tg-chip-warn b{color:var(--tg-warn)}
.tg-chip.tg-chip-err b{color:var(--tg-err)}
.tg-chip.tg-insight{color:var(--tg-text3)}
.tg-chip.tg-insight b{color:var(--tg-text2);font-weight:500}

.tg-main{flex:1;display:flex;min-height:0;position:relative}
.tg-canvas{flex:1;position:relative;min-width:0;overflow:hidden;background:
  radial-gradient(circle at 1px 1px, var(--tg-border) 1px, transparent 1.5px) 0 0/26px 26px;
}
.tg-canvas svg{position:absolute;inset:0;user-select:none;-webkit-user-select:none}
.tg-hint{position:absolute;left:12px;bottom:10px;font-size:11px;color:var(--tg-text3);pointer-events:none}

/* edges */
.tg-edge{fill:none;stroke:var(--tg-border2);stroke-width:1.4;transition:stroke .12s}
.tg-edge.tg-edge-join{stroke-dasharray:none}
.tg-edge.tg-edge-retry{stroke:var(--tg-warn);stroke-dasharray:5 4}
.tg-edge.tg-hot{stroke:var(--tg-warn);stroke-width:2.6}
.tg-edge.tg-neigh{stroke:var(--tg-accent);stroke-width:2}
.tg-edge.tg-dim{stroke-opacity:.18}
.tg-arrowhead{fill:var(--tg-border2)}
.tg-arrowhead.tg-hot{fill:var(--tg-warn)}

/* nodes */
.tg-node{cursor:pointer}
.tg-node .tg-nodebox{fill:var(--tg-bg2);stroke:var(--tg-border2);stroke-width:1.2;transition:stroke .12s,filter .12s}
.tg-node:hover .tg-nodebox{stroke:var(--tg-text3)}
.tg-node[data-status=RUNNING] .tg-nodebox{stroke:var(--tg-accent);stroke-width:1.6}
.tg-node[data-status=SUCCESS] .tg-nodebox{stroke:color-mix(in srgb, var(--tg-ok) 55%, var(--tg-border2))}
.tg-node[data-status=FAILED] .tg-nodebox{stroke:var(--tg-err);stroke-width:1.6}
.tg-node[data-status=RETRYING] .tg-nodebox{stroke:var(--tg-warn);stroke-width:1.6}
.tg-node[data-status=CANCELLED] .tg-nodebox{stroke:var(--tg-cancel)}
.tg-node[data-status=CANCELLED],.tg-node[data-status=SKIPPED]{opacity:.55}
.tg-node.tg-selected .tg-nodebox{stroke:var(--tg-accent);stroke-width:2.2;filter:drop-shadow(0 0 6px color-mix(in srgb, var(--tg-accent) 55%, transparent))}
.tg-node.tg-search-hit .tg-nodebox{stroke:var(--tg-warn);stroke-width:2.2}
.tg-node.tg-cp .tg-nodebox{stroke:var(--tg-warn);stroke-width:2;filter:drop-shadow(0 0 5px color-mix(in srgb, var(--tg-warn) 40%, transparent))}
.tg-node.tg-dim{opacity:.22}
.tg-node[data-status=RUNNING] .tg-pulse{animation:tgPulse 1.6s ease-out infinite}
@keyframes tgPulse{0%{stroke-opacity:.8;stroke-width:2}70%{stroke-opacity:0;stroke-width:14}100%{stroke-opacity:0;stroke-width:14}}
.tg-node text{fill:var(--tg-text);font-family:var(--tg-font)}
.tg-node .tg-nlabel{font-size:12px;font-weight:600}
.tg-node .tg-nmeta{font-size:10px;fill:var(--tg-text2)}
.tg-node .tg-nbadge{font-size:9.5px;font-weight:700}
.tg-ntype{font-size:9px;font-weight:800;letter-spacing:.4px}
.tg-collapse{cursor:pointer}
.tg-collapse circle{fill:var(--tg-bg);stroke:var(--tg-border2)}
.tg-collapse:hover circle{stroke:var(--tg-accent)}
.tg-collapse path{stroke:var(--tg-text2);fill:none;stroke-width:1.4}
.tg-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--tg-text3);font-size:13px;flex-direction:column;gap:10px}

/* detail panel */
.tg-detail{width:360px;flex:none;border-left:1px solid var(--tg-border);background:var(--tg-bg);display:flex;flex-direction:column;min-height:0}
.tg-detail[hidden]{display:none}
.tg-detail-head{flex:none;display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--tg-border)}
.tg-detail-head h3{margin:0;font-size:13px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tg-x{border:none;background:0 0;color:var(--tg-text3);cursor:pointer;font-size:15px;padding:2px 6px;border-radius:6px}
.tg-x:hover{background:var(--tg-bg3);color:var(--tg-text)}
.tg-detail-body{flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:10px;scrollbar-width:thin}
.tg-kv{display:grid;grid-template-columns:92px 1fr;gap:4px 10px;font-size:12px}
.tg-kv dt{color:var(--tg-text3);margin:0}
.tg-kv dd{margin:0;color:var(--tg-text);overflow-wrap:anywhere;min-width:0}
.tg-sec{font-size:11px;font-weight:700;color:var(--tg-text3);text-transform:uppercase;letter-spacing:.6px;margin:4px 0 0}
.tg-pre{background:var(--tg-bg2);border:1px solid var(--tg-border);border-radius:8px;padding:8px 10px;font-family:var(--tg-mono);font-size:11px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;margin:0;color:var(--tg-text2)}
.tg-pre.tg-err{color:var(--tg-err);border-color:color-mix(in srgb, var(--tg-err) 45%, var(--tg-border))}
.tg-attempt{border:1px solid var(--tg-border);border-radius:8px;padding:6px 9px;font-size:11.5px;display:flex;flex-direction:column;gap:3px;color:var(--tg-text2)}
.tg-attempt b{color:var(--tg-text)}
.tg-attempt[data-status=FAILED]{border-color:color-mix(in srgb, var(--tg-err) 50%, var(--tg-border))}
.tg-attempt[data-status=SUCCESS]{border-color:color-mix(in srgb, var(--tg-ok) 45%, var(--tg-border))}
.tg-link{color:var(--tg-accent);cursor:pointer;border:none;background:0 0;padding:0;font-size:12px;font-family:inherit}
.tg-link:hover{text-decoration:underline}
.tg-evrow{display:flex;gap:8px;align-items:baseline;font-size:11.5px;color:var(--tg-text2)}
.tg-evrow code{font-family:var(--tg-mono);color:var(--tg-text3)}

/* trajectory drawer */
.tg-traj{flex:none;border-top:1px solid var(--tg-border);background:var(--tg-bg);height:230px;display:flex;flex-direction:column;min-height:0}
.tg-traj[hidden]{display:none}
.tg-traj-head{flex:none;display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid var(--tg-border)}
.tg-traj-head b{font-size:12px}
.tg-traj-list{flex:1;overflow-y:auto;font-family:var(--tg-mono);font-size:11px;scrollbar-width:thin}
.tg-traj-row{display:grid;grid-template-columns:86px 52px 150px 1fr;gap:8px;padding:3px 12px;border-bottom:1px solid color-mix(in srgb, var(--tg-border) 45%, transparent);cursor:pointer;align-items:baseline}
.tg-traj-row:hover{background:var(--tg-bg3)}
.tg-traj-row.tg-hit{background:color-mix(in srgb, var(--tg-accent) 16%, transparent);outline:1px solid var(--tg-accent);border-radius:4px}
.tg-traj-row .tg-ttime{color:var(--tg-text3)}
.tg-traj-row .tg-tseq{color:var(--tg-text3);text-align:right}
.tg-traj-row .tg-ttype{color:var(--tg-accent);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tg-traj-row .tg-tsum{color:var(--tg-text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tg-traj-row[data-err] .tg-tsum{color:var(--tg-err)}
.tg-traj-row[data-node]{box-shadow:inset 3px 0 0 var(--tg-accent)}

/* task list overlay */
.tg-pop{position:absolute;z-index:70;background:var(--tg-bg2);border:1px solid var(--tg-border2);border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.4);max-height:420px;overflow:auto;display:none;min-width:320px}
.tg-pop[data-open]{display:block}
.tg-task-row{padding:8px 12px;cursor:pointer;border-bottom:1px solid color-mix(in srgb, var(--tg-border) 40%, transparent);display:flex;flex-direction:column;gap:2px}
.tg-task-row:hover,.tg-task-row[data-active]{background:var(--tg-bg3)}
.tg-task-row .tg-tr1{display:flex;gap:8px;align-items:center;font-size:12.5px}
.tg-task-row .tg-tr1 span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tg-task-row .tg-tr2{font-size:10.5px;color:var(--tg-text3);display:flex;gap:10px}

@media (max-width:900px){.tg-detail{position:absolute;right:0;top:0;bottom:0;z-index:65;box-shadow:-8px 0 24px rgba(0,0,0,.35)}}
`;

    function injectCss() {
      if (document.getElementById('dsh-taskgraph-style')) return;
      const tag = document.createElement('style');
      tag.id = 'dsh-taskgraph-style';
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    /* ================================================================ *
     * Tiny helpers                                                     *
     * ================================================================ */
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const STATUS_TEXT = {
      PENDING: '待执行', RUNNING: '执行中', SUCCESS: '成功', FAILED: '失败',
      SKIPPED: '跳过', CANCELLED: '已取消', RETRYING: '重试中',
    };
    const TYPE_LABEL = {
      task: 'Task', phase: 'Turn', agent: 'Agent', tool: 'Tool', skill: 'Skill',
      subagent: 'SubAgent', plan: 'Plan', code: 'Code', test: 'Test', knowledge: 'Knowledge',
    };
    const TYPE_COLOR = {
      task: 'var(--tg-accent)', phase: '#7aa2f7', agent: '#56b6c2', tool: '#8b949e',
      skill: '#c678dd', subagent: '#e5c07b', plan: '#98c379', code: '#d19a66', test: '#61afef',
    };

    function el(tag, attrs, children) {
      const node = document.createElement(tag);
      if (attrs) for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (v !== undefined && v !== null) node.setAttribute(k, v);
      }
      if (children) for (const child of [].concat(children)) {
        if (child === null || child === undefined) continue;
        node.append(child.nodeType ? child : document.createTextNode(String(child)));
      }
      return node;
    }

    function svgEl(tag, attrs, children) {
      const node = document.createElementNS(SVG_NS, tag);
      if (attrs) for (const [k, v] of Object.entries(attrs)) {
        if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (v !== undefined && v !== null) node.setAttribute(k, String(v));
      }
      if (children) for (const child of [].concat(children)) {
        if (child) node.append(child.nodeType ? child : document.createTextNode(String(child)));
      }
      return node;
    }

    function fmtDuration(ms) {
      if (ms === null || ms === undefined || Number.isNaN(ms)) return '—';
      if (ms < 1000) return `${Math.round(ms)}ms`;
      const s = ms / 1000;
      if (s < 60) return `${s.toFixed(1)}s`;
      const m = Math.floor(s / 60);
      if (m < 60) return `${m}m ${Math.round(s % 60)}s`;
      const h = Math.floor(m / 60);
      if (h < 48) return `${h}h ${m % 60}m`;
      return `${(h / 24).toFixed(1)}d`;
    }
    function fmtClock(ts) {
      if (!ts) return '—';
      const d = new Date(ts);
      const p = (n) => String(n).padStart(2, '0');
      return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }
    function fmtNum(n) {
      if (n === null || n === undefined) return '—';
      if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
      return String(n);
    }
    function truncate(text, n) {
      const s = String(text ?? '');
      return s.length > n ? `${s.slice(0, n - 1)}…` : s;
    }
    // CSS.escape is unavailable on some WebKit builds; ids are our own
    // [A-Za-z0-9_-] tokens so a minimal attribute-value escape suffices.
    function cssEsc(value) {
      return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }
    function pretty(value) {
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') {
        try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
      }
      try { return JSON.stringify(value, null, 2); } catch { return String(value); }
    }
    function debounce(fn, ms) {
      let t = null;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
      };
    }

    /* ================================================================ *
     * API                                                              *
     * ================================================================ */
    const API_BASE = '/task-graph/api';
    async function api(path) {
      const res = await fetch(API_BASE + path, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
      return res.json();
    }

    /* ================================================================ *
     * Visibility model: type filter + hierarchical collapse.           *
     * ================================================================ */
    const FILTER_TYPES = ['phase', 'agent', 'tool', 'skill', 'subagent', 'code', 'test', 'plan'];

    function buildIndex(graph) {
      const byId = new Map(graph.nodes.map((n) => [n.id, n]));
      const children = new Map();
      for (const n of graph.nodes) {
        if (!n.parent_id) continue;
        if (!children.has(n.parent_id)) children.set(n.parent_id, []);
        children.get(n.parent_id).push(n.id);
      }
      return { byId, children };
    }

    /**
     * Collapse semantics: collapsing a group hides its descendants; edges are
     * re-anchored to the nearest visible ancestor so context survives.
     */
    function computeVisibility(graph, index, hiddenTypes, collapsed) {
      const { byId, children } = index;
      const hidden = new Set();
      const isCollapsed = (id) => collapsed.has(id);
      const stack = [];
      for (const id of collapsed) {
        for (const c of children.get(id) ?? []) stack.push(c);
      }
      while (stack.length) {
        const id = stack.pop();
        if (hidden.has(id)) continue;
        hidden.add(id);
        for (const c of children.get(id) ?? []) stack.push(c);
      }
      const visible = [];
      for (const n of graph.nodes) {
        if (hidden.has(n.id)) continue;
        if (hiddenTypes.has(n.type)) continue;
        visible.push(n);
      }
      const visibleSet = new Set(visible.map((n) => n.id));
      // nearest visible ancestor (or self)
      const anchor = (id) => {
        let cur = id;
        while (cur && !visibleSet.has(cur)) cur = byId.get(cur)?.parent_id ?? null;
        return cur;
      };
      return { visible, visibleSet, anchor, isCollapsed, byId };
    }

    /* ================================================================ *
     * DAG layout (layered, top→bottom)                                 *
     * ================================================================ */
    const NODE_W = 190;
    const NODE_H = 44;
    const H_GAP = 26;
    const V_GAP = 64;

    function layoutDAG(graph, vis) {
      const nodes = vis.visible;
      const idSet = vis.visibleSet;
      const pos = new Map();
      if (nodes.length === 0) return { pos, width: 0, height: 0 };

      // adjacency over non-self edges
      const preds = new Map();
      const succs = new Map();
      for (const e of graph.edges) {
        if (e.source === e.target) continue;
        const s = vis.anchor(e.source);
        const t = vis.anchor(e.target);
        if (!s || !t || s === t || !idSet.has(s) || !idSet.has(t)) continue;
        if (!succs.has(s)) succs.set(s, []);
        if (!preds.has(t)) preds.set(t, []);
        succs.get(s).push(t);
        preds.get(t).push(s);
      }

      // longest-path layering via Kahn topological pass; falls back to
      // containment depth when the visible slice contains a cycle.
      const layer = new Map();
      const indeg = new Map();
      for (const n of nodes) indeg.set(n.id, (preds.get(n.id) ?? []).length);
      const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
      for (const id of queue) layer.set(id, 0);
      let head = 0;
      while (head < queue.length) {
        const id = queue[head]; head += 1;
        for (const t of succs.get(id) ?? []) {
          layer.set(t, Math.max(layer.get(t) ?? 0, (layer.get(id) ?? 0) + 1));
          indeg.set(t, indeg.get(t) - 1);
          if (indeg.get(t) === 0) queue.push(t);
        }
      }
      // fallback for leftovers (cycles)
      const depthOf = (n) => {
        let d = 0;
        let cur = n;
        while (cur?.parent_id && idSet.has(cur.parent_id)) { d += 1; cur = vis.byId?.get?.(cur.parent_id); if (!cur) break; }
        return d;
      };
      for (const n of nodes) if (!layer.has(n.id)) layer.set(n.id, depthOf(n));

      // group into layers
      const maxLayer = Math.max(...layer.values(), 0);
      const layers = Array.from({ length: maxLayer + 1 }, () => []);
      for (const n of nodes) layers[layer.get(n.id)].push(n);

      // order within a layer by parent position, then start time → keeps
      // parallel siblings adjacent and stable.
      const indexOf = new Map();
      layers.forEach((row) => {
        row.sort((a, b) => {
          const pa = a.parent_id ?? '';
          const pb = b.parent_id ?? '';
          if (pa !== pb) return pa < pb ? -1 : 1;
          return (a.start_time ?? 0) - (b.start_time ?? 0);
        });
        row.forEach((n) => indexOf.set(n.id, indexOf.size));
      });

      // barycenter sweep to reduce crossings (2 passes)
      for (let pass = 0; pass < 2; pass += 1) {
        for (let li = 1; li <= maxLayer; li += 1) {
          const row = layers[li];
          const bc = new Map();
          for (const n of row) {
            const ps = (preds.get(n.id) ?? []).map((p) => indexOf.get(p)).filter((v) => v !== undefined);
            bc.set(n.id, ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : indexOf.get(n.id) ?? 0);
          }
          row.sort((a, b) => bc.get(a.id) - bc.get(b.id));
          row.forEach((n, i) => indexOf.set(n.id, li * 10000 + i));
        }
      }

      // coordinates: center each layer around x=0
      let width = 0;
      for (const row of layers) {
        const rowW = row.length * (NODE_W + H_GAP) - H_GAP;
        width = Math.max(width, rowW);
      }
      let y = 0;
      let maxH = 0;
      layers.forEach((row, li) => {
        const rowW = row.length * (NODE_W + H_GAP) - H_GAP;
        let x = (width - rowW) / 2;
        for (const n of row) {
          pos.set(n.id, { x, y, w: NODE_W, h: NODE_H });
          x += NODE_W + H_GAP;
        }
        y += NODE_H + V_GAP;
      });
      maxH = y - V_GAP;
      return { pos, width, height: maxH, layers };
    }

    /* ================================================================ *
     * Timeline layout (x = wall-clock, rows = containment lanes)       *
     * ================================================================ */
    function layoutTimeline(graph, vis) {
      const nodes = vis.visible
        .filter((n) => n.type !== 'task' && n.start_time != null && n.end_time != null)
        .sort((a, b) => a.start_time - b.start_time);
      const pos = new Map();
      if (nodes.length === 0) return { pos, width: 0, height: 0 };
      const t0 = Math.min(...nodes.map((n) => n.start_time));
      const t1 = Math.max(...nodes.map((n) => n.end_time));
      const span = Math.max(1, t1 - t0);
      const W = Math.max(900, Math.min(4000, span / 8));
      const x = (t) => ((t - t0) / span) * (W - 40) + 20;

      // lane = top-level group (phase/task), row packing inside each lane
      const laneEnds = new Map();
      const laneOf = new Map();
      let laneCount = 0;
      const H = 34;
      for (const n of nodes) {
        let lane = n.parent_id ?? 'root';
        let top = n;
        const seen = new Set();
        while (top.parent_id && vis.visibleSet.has(top.parent_id) && !seen.has(top.parent_id)) {
          seen.add(top.parent_id);
          const p = vis.byId.get(top.parent_id);
          if (!p) break;
          top = p;
        }
        lane = top.id;
        if (!laneOf.has(lane)) { laneOf.set(lane, laneCount); laneEnds.set(lane, []); laneCount += 1; }
        const li = laneOf.get(lane);
        const ends = laneEnds.get(lane);
        const xs = x(n.start_time);
        const xe = Math.max(x(n.end_time), xs + 6);
        let row = ends.findIndex((e) => e <= xs - 4);
        if (row === -1) { row = ends.length; ends.push(xe); } else ends[row] = xe;
        const y = li * (4 * (H + 6)) + row * (H + 6) + 20;
        pos.set(n.id, { x: xs, y, w: Math.max(6, xe - xs), h: H, bar: true });
      }
      const height = laneCount * (4 * (H + 6)) + 40;
      return { pos, width: W, height, t0, t1, x, timeline: true };
    }

    /* ================================================================ *
     * Force layout (simple spring model, for exploration)              *
     * ================================================================ */
    function layoutForce(graph, vis) {
      const nodes = vis.visible;
      const pos = new Map();
      if (nodes.length === 0) return { pos, width: 0, height: 0 };
      const N = nodes.length;
      const idx = new Map(nodes.map((n, i) => [n.id, i]));
      const px = new Float64Array(N);
      const py = new Float64Array(N);
      // seed on a circle (deterministic)
      for (let i = 0; i < N; i += 1) {
        const a = (i / N) * Math.PI * 2;
        const r = 240 + (i % 7) * 40;
        px[i] = Math.cos(a) * r;
        py[i] = Math.sin(a) * r;
      }
      const springs = [];
      for (const e of graph.edges) {
        if (e.source === e.target) continue;
        const s = idx.get(vis.anchor(e.source));
        const t = idx.get(vis.anchor(e.target));
        if (s === undefined || t === undefined || s === t) continue;
        springs.push([s, t]);
      }
      const REP = 26000;
      const K = 0.02;
      const L = 130;
      const ITER = Math.min(260, Math.max(90, Math.floor(30000 / Math.max(1, N))));
      for (let it = 0; it < ITER; it += 1) {
        const fx = new Float64Array(N);
        const fy = new Float64Array(N);
        for (let i = 0; i < N; i += 1) {
          for (let j = i + 1; j < N; j += 1) {
            let dx = px[i] - px[j];
            let dy = py[i] - py[j];
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) { d2 = 1; dx = (i - j) * 0.1; dy = 0.1; }
            const f = REP / d2;
            const d = Math.sqrt(d2);
            const ux = dx / d;
            const uy = dy / d;
            fx[i] += ux * f; fy[i] += uy * f;
            fx[j] -= ux * f; fy[j] -= uy * f;
          }
        }
        for (const [s, t] of springs) {
          const dx = px[t] - px[s];
          const dy = py[t] - py[s];
          const d = Math.max(1, Math.hypot(dx, dy));
          const f = K * (d - L);
          const ux = dx / d;
          const uy = dy / d;
          fx[s] += ux * f; fy[s] += uy * f;
          fx[t] -= ux * f; fy[t] -= uy * f;
        }
        const cool = 1 - it / ITER;
        for (let i = 0; i < N; i += 1) {
          const cap = 18 * cool + 2;
          px[i] += Math.max(-cap, Math.min(cap, fx[i] * 0.02));
          py[i] += Math.max(-cap, Math.min(cap, fy[i] * 0.02));
        }
      }
      let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      nodes.forEach((n, i) => {
        minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]);
        minY = Math.min(minY, py[i]); maxY = Math.max(maxY, py[i]);
      });
      nodes.forEach((n, i) => {
        pos.set(n.id, { x: px[i] - minX + 20, y: py[i] - minY + 20, w: NODE_W, h: NODE_H });
      });
      return { pos, width: maxX - minX + NODE_W + 40, height: maxY - minY + NODE_H + 40 };
    }

    /* ================================================================ *
     * Graph renderer (SVG). Owns pan/zoom + all draw passes.           *
     * ================================================================ */
    class GraphRenderer {
      constructor(canvas, app) {
        this.canvas = canvas;
        this.app = app;
        this.svg = svgEl('svg', { width: '100%', height: '100%' });
        this.defs = svgEl('defs');
        this.arrow = svgEl('marker', {
          id: 'tg-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5',
          markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse',
        }, [svgEl('path', { d: 'M0,0 L10,5 L0,10 z', class: 'tg-arrowhead' })]);
        this.arrowHot = svgEl('marker', {
          id: 'tg-arrow-hot', viewBox: '0 0 10 10', refX: '9', refY: '5',
          markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse',
        }, [svgEl('path', { d: 'M0,0 L10,5 L0,10 z', class: 'tg-arrowhead tg-hot' })]);
        this.defs.append(this.arrow, this.arrowHot);
        this.world = svgEl('g', { class: 'tg-world' });
        this.edgeLayer = svgEl('g');
        this.nodeLayer = svgEl('g');
        this.world.append(this.edgeLayer, this.nodeLayer);
        this.svg.append(this.defs, this.world);
        canvas.appendChild(this.svg);

        this.view = { x: 0, y: 0, k: 1 };
        this.layout = null;
        this._bindPanZoom();
      }

      _bindPanZoom() {
        let dragging = null;
        this.svg.addEventListener('pointerdown', (ev) => {
          if (ev.button !== 0) return;
          const target = ev.target.closest('.tg-node, .tg-collapse');
          if (target) return; // node handles its own clicks
          dragging = { x: ev.clientX, y: ev.clientY, vx: this.view.x, vy: this.view.y };
          this.svg.setPointerCapture(ev.pointerId);
        });
        this.svg.addEventListener('pointermove', (ev) => {
          if (!dragging) return;
          this.view.x = dragging.vx + (ev.clientX - dragging.x);
          this.view.y = dragging.vy + (ev.clientY - dragging.y);
          this._applyTransform();
        });
        this.svg.addEventListener('pointerup', () => { dragging = null; });
        this.svg.addEventListener('pointercancel', () => { dragging = null; });
        this.canvas.addEventListener('wheel', (ev) => {
          ev.preventDefault();
          const rect = this.canvas.getBoundingClientRect();
          const cx = ev.clientX - rect.left;
          const cy = ev.clientY - rect.top;
          const factor = Math.exp(-ev.deltaY * 0.0016);
          const nk = Math.min(2.4, Math.max(0.12, this.view.k * factor));
          const scale = nk / this.view.k;
          this.view.x = cx - (cx - this.view.x) * scale;
          this.view.y = cy - (cy - this.view.y) * scale;
          this.view.k = nk;
          this._applyTransform();
        }, { passive: false });
      }

      _applyTransform() {
        this.world.setAttribute('transform', `translate(${this.view.x},${this.view.y}) scale(${this.view.k})`);
      }

      fit() {
        if (!this.layout) return;
        const { width, height } = this.layout;
        const rect = this.canvas.getBoundingClientRect();
        if (!width || !height || !rect.width || !rect.height) return;
        const pad = 40;
        const k = Math.min(
          (rect.width - pad * 2) / width,
          (rect.height - pad * 2) / height,
          1.1,
        );
        const kk = Math.max(0.15, Math.min(2.4, k));
        this.view.k = kk;
        this.view.x = (rect.width - width * kk) / 2;
        this.view.y = pad * 0.6;
        this._applyTransform();
      }

      zoomBy(factor) {
        const rect = this.canvas.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const nk = Math.min(2.4, Math.max(0.12, this.view.k * factor));
        const scale = nk / this.view.k;
        this.view.x = cx - (cx - this.view.x) * scale;
        this.view.y = cy - (cy - this.view.y) * scale;
        this.view.k = nk;
        this._applyTransform();
      }

      clear() {
        this.edgeLayer.replaceChildren();
        this.nodeLayer.replaceChildren();
      }

      render(graph, vis, layout, opts) {
        this.layout = layout;
        this.clear();
        const hotEdges = opts.criticalPath ? new Set(opts.criticalPath.edge_ids) : null;
        const hotNodes = opts.criticalPath ? new Set(opts.criticalPath.node_ids) : null;
        const searchHits = opts.searchHits;

        // ---- edges ----
        for (const e of graph.edges) {
          const s = layout.pos.get(vis.anchor(e.source));
          const t = layout.pos.get(vis.anchor(e.target));
          if (!s || !t) continue;
          if (vis.anchor(e.source) === vis.anchor(e.target)) {
            if (e.type === 'retries') this._drawRetryArc(layout.pos.get(e.source), e);
            continue;
          }
          const d = this._edgePath(s, t, layout.timeline);
          const cls = ['tg-edge'];
          if (e.type === 'retries') cls.push('tg-edge-retry');
          let marker = 'url(#tg-arrow)';
          if (hotEdges && hotEdges.has(e.id)) { cls.push('tg-hot'); marker = 'url(#tg-arrow-hot)'; }
          this.edgeLayer.appendChild(svgEl('path', {
            d, class: cls.join(' '), 'marker-end': marker,
            'data-edge': e.id,
          }));
        }

        // ---- nodes ----
        for (const n of vis.visible) {
          const p = layout.pos.get(n.id);
          if (!p) continue;
          this.nodeLayer.appendChild(this._drawNode(n, p, vis, {
            selected: opts.selected === n.id,
            cp: hotNodes ? hotNodes.has(n.id) : false,
            searchHit: searchHits ? searchHits.has(n.id) : false,
          }));
        }
        this._applyTransform();
      }

      _edgePath(s, t, timeline) {
        if (timeline) {
          const sx = s.x + s.w;
          const sy = s.y + s.h / 2;
          const tx = t.x;
          const ty = t.y + t.h / 2;
          const mx = (sx + tx) / 2;
          return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
        }
        const sx = s.x + s.w / 2;
        const sy = s.y + s.h;
        const tx = t.x + t.w / 2;
        const ty = t.y;
        const dy = Math.max(18, (ty - sy) * 0.5);
        if (ty >= sy) {
          return `M${sx},${sy} C${sx},${sy + dy} ${tx},${ty - dy} ${tx},${ty}`;
        }
        // upward edge → route around the side
        const off = 60;
        return `M${sx},${sy} C${sx},${sy + 40} ${tx + off},${ty - 40} ${tx},${ty}`;
      }

      _drawRetryArc(p, edge) {
        if (!p) return;
        const cx = p.x + p.w;
        const cy = p.y + p.h / 2;
        const r = 26;
        const d = `M${cx},${cy - 10} C${cx + r},${cy - 10} ${cx + r},${cy + 10} ${cx},${cy + 10}`;
        this.edgeLayer.appendChild(svgEl('path', {
          d, class: 'tg-edge tg-edge-retry', 'marker-end': 'url(#tg-arrow)', 'data-edge': edge.id,
        }));
        const attempts = edge.meta?.attempts ?? '';
        this.edgeLayer.appendChild(svgEl('text', {
          x: cx + r + 4, y: cy + 3, class: 'tg-nbadge', fill: 'var(--tg-warn)', 'font-size': '10',
        }, [`×${attempts}`]));
      }

      _drawNode(n, p, vis, flags) {
        const g = svgEl('g', {
          class: 'tg-node',
          transform: `translate(${p.x},${p.y})`,
          'data-id': n.id,
          'data-status': n.status,
        });
        if (flags.selected) g.classList.add('tg-selected');
        if (flags.cp) g.classList.add('tg-cp');
        if (flags.searchHit) g.classList.add('tg-search-hit');

        const statusStroke = {
          RUNNING: 'var(--tg-accent)', SUCCESS: 'var(--tg-ok)', FAILED: 'var(--tg-err)',
          RETRYING: 'var(--tg-warn)', CANCELLED: 'var(--tg-cancel)',
        }[n.status] || 'var(--tg-border2)';

        if (n.status === 'RUNNING') {
          g.appendChild(svgEl('rect', {
            class: 'tg-pulse', x: 0, y: 0, width: p.w, height: p.h, rx: 10,
            fill: 'none', stroke: statusStroke, 'stroke-width': 2,
          }));
        }
        g.appendChild(svgEl('rect', {
          class: 'tg-nodebox', x: 0, y: 0, width: p.w, height: p.h, rx: 10,
        }));

        // status dot
        const dotColor = {
          RUNNING: 'var(--tg-accent)', SUCCESS: 'var(--tg-ok)', FAILED: 'var(--tg-err)',
          RETRYING: 'var(--tg-warn)', CANCELLED: 'var(--tg-cancel)',
        }[n.status] || 'var(--tg-text3)';
        g.appendChild(svgEl('circle', { cx: 12, cy: p.h / 2, r: 4, fill: dotColor }));

        const typeColor = TYPE_COLOR[n.type] || 'var(--tg-text2)';
        g.appendChild(svgEl('text', {
          x: 24, y: 16, class: 'tg-ntype', fill: typeColor,
        }, [(TYPE_LABEL[n.type] || n.type).toUpperCase()]));

        const name = truncate(n.name || n.id, p.bar ? 40 : 26);
        g.appendChild(svgEl('text', {
          x: 24, y: 30, class: 'tg-nlabel',
        }, [name]));

        const meta = this._nodeMeta(n);
        if (meta) {
          g.appendChild(svgEl('text', {
            x: 24, y: p.h - 7, class: 'tg-nmeta',
          }, [meta]));
        }

        // collapse/expand affordance for groups with children
        const childCount = this._countDescendants(n.id, vis);
        if (childCount > 0 && n.type !== 'tool') {
          const collapsed = vis.isCollapsed(n.id);
          const bx = p.w - 14;
          const by = p.h / 2;
          const btn = svgEl('g', { class: 'tg-collapse', 'data-collapse': n.id, transform: `translate(${bx},${by})` });
          btn.appendChild(svgEl('circle', { r: 9 }));
          const d = collapsed
            ? 'M-3,-3 L3,0 L-3,3'   // pointing right (expand)
            : 'M-3,-2 L0,2 L3,-2';  // pointing down (collapse)
          btn.appendChild(svgEl('path', { d }));
          if (collapsed) {
            btn.appendChild(svgEl('text', {
              x: 0, y: -13, 'text-anchor': 'middle', class: 'tg-nbadge', fill: 'var(--tg-text2)', 'font-size': '9',
            }, [String(childCount)]));
          }
          btn.addEventListener('click', (ev) => { ev.stopPropagation(); this.app.toggleCollapse(n.id); });
          g.appendChild(btn);
        }

        g.addEventListener('click', (ev) => { ev.stopPropagation(); this.app.selectNode(n.id); });
        g.addEventListener('dblclick', (ev) => {
          ev.stopPropagation();
          if (childCount > 0) this.app.toggleCollapse(n.id);
        });
        g.addEventListener('mouseenter', () => this.app.hoverNode(n.id, true));
        g.addEventListener('mouseleave', () => this.app.hoverNode(n.id, false));
        return g;
      }

      _countDescendants(id, vis) {
        // count visible children directly under this node
        let count = 0;
        for (const n of vis.visible) if (n.parent_id === id) count += 1;
        return count;
      }

      _nodeMeta(n) {
        const parts = [];
        if (n.duration_ms != null) parts.push(fmtDuration(n.duration_ms));
        if (n.type === 'agent') {
          const t = n.meta?.tokens;
          if (t && (t.input || t.output)) parts.push(`${fmtNum(t.input)}→${fmtNum(t.output)}`);
          if (n.meta?.model) parts.push(truncate(n.meta.model, 14));
        }
        if (n.type === 'tool' || n.type === 'test' || n.type === 'code') {
          const att = n.meta?.attempts?.length;
          if (att > 1) parts.push(`att×${att}`);
        }
        if (n.type === 'subagent' && n.meta?.child_session?.title) parts.push('→ sub');
        return parts.join('  ');
      }

      // ---- highlight helpers ----
      setDim(ids) {
        const nodes = this.nodeLayer.querySelectorAll('.tg-node');
        nodes.forEach((g) => {
          if (ids === null) g.classList.remove('tg-dim');
          else g.classList.toggle('tg-dim', !ids.has(g.getAttribute('data-id')));
        });
      }
      highlightEdges(set, mode) {
        const edges = this.edgeLayer.querySelectorAll('.tg-edge');
        edges.forEach((p) => {
          p.classList.remove('tg-neigh', 'tg-dim');
          if (!set) return;
          const id = p.getAttribute('data-edge');
          if (set.has(id)) p.classList.add(mode === 'dim' ? 'tg-neigh' : 'tg-neigh');
          else if (mode === 'dim') p.classList.add('tg-dim');
        });
      }
      focusNode(id) {
        const g = this.nodeLayer.querySelector(`.tg-node[data-id="${cssEsc(id)}"]`);
        if (!g || !this.layout) return;
        const p = this.layout.pos.get(id);
        if (!p) return;
        const rect = this.canvas.getBoundingClientRect();
        this.view.k = Math.max(this.view.k, 0.8);
        this.view.x = rect.width / 2 - (p.x + p.w / 2) * this.view.k;
        this.view.y = rect.height / 2 - (p.y + p.h / 2) * this.view.k;
        this._applyTransform();
      }
    }

    /* ================================================================ *
     * App controller                                                   *
     * ================================================================ */
    class App {
      constructor(root, { standalone = false } = {}) {
        this.root = root;
        this.standalone = standalone;
        this.tasks = [];
        this.current = null;      // task list entry
        this.graph = null;
        this.index = null;
        this.events = [];
        this.seqToNode = new Map();
        this.selected = null;
        this.layoutMode = 'dag';
        this.hiddenTypes = new Set();
        this.collapsed = new Set();
        this.searchTerm = '';
        this.cpOn = false;
        this.trajOpen = false;
        this.opened = false;
        this.liveSource = null;
        this._build();
      }

      _build() {
        this.root.innerHTML = '';
        // top bar
        this.taskBtn = el('button', { class: 'tg-select', onclick: () => this._toggleTaskPicker() }, ['选择任务…']);
        this.badge = el('span', { class: 'tg-badge' });
        this.search = el('input', { class: 'tg-search', placeholder: '搜索节点 (名称/工具/文件)', type: 'search' });
        this.search.addEventListener('input', () => { this.searchTerm = this.search.value.trim(); this.render(); });

        const layoutSeg = el('div', { class: 'tg-seg' });
        this.layoutBtns = {};
        for (const mode of ['dag', 'timeline', 'force']) {
          const b = el('button', { class: 'tg-btn', onclick: () => this.setLayout(mode) },
            [{ dag: 'DAG', timeline: '时间线', force: '力导向' }[mode]]);
          this.layoutBtns[mode] = b;
          layoutSeg.appendChild(b);
        }

        this.cpBtn = el('button', { class: 'tg-btn', title: '高亮关键路径', onclick: () => this.toggleCP() }, ['⚡ 关键路径']);
        this.trajBtn = el('button', { class: 'tg-btn', onclick: () => this.toggleTraj() }, ['≡ Trajectory']);
        this.fitBtn = el('button', { class: 'tg-btn', onclick: () => this.renderer.fit() }, ['⤢ 适配']);
        this.zinBtn = el('button', { class: 'tg-btn', onclick: () => this.renderer.zoomBy(1.25) }, ['+']);
        this.zoutBtn = el('button', { class: 'tg-btn', onclick: () => this.renderer.zoomBy(0.8) }, ['−']);
        this.expandBtn = el('button', { class: 'tg-btn', onclick: () => { this.collapsed.clear(); this.render(); } }, ['全部展开']);
        this.exportBtn = el('button', { class: 'tg-btn', onclick: () => this.exportGraph() }, ['⤓ JSON']);

        const filterWrap = el('div', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' });
        this.filterBtn = el('button', { class: 'tg-btn', onclick: (e) => this._toggleFilterPop(e) }, ['⚙ 过滤']);
        filterWrap.append(this.filterBtn);
        this.filterPop = el('div', { class: 'tg-pop' });

        const topRow = el('div', { class: 'tg-toprow' }, [
          el('span', { class: 'tg-title', html: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="3" cy="8" r="2"/><circle cx="12" cy="3.5" r="2"/><circle cx="12" cy="12.5" r="2"/><path d="M5 7.4 10 4M5 8.6 10 12"/></svg> Task Graph' }),
          this.taskBtn, this.badge,
          el('span', { class: 'tg-spacer' }),
          this.search, layoutSeg,
        ]);
        const ctrlRow = el('div', { class: 'tg-toprow', style: 'padding-top:0' }, [
          this.cpBtn, this.trajBtn,
          el('span', { class: 'tg-spacer' }),
          filterWrap, this.expandBtn,
          this.zoutBtn, this.zinBtn, this.fitBtn, this.exportBtn,
        ]);
        this.summary = el('div', { class: 'tg-summary' });
        const top = el('div', { class: 'tg-top' }, [topRow, ctrlRow, this.summary]);

        // main canvas + detail panel
        this.canvas = el('div', { class: 'tg-canvas' });
        this.hint = el('div', { class: 'tg-hint' }, ['拖拽平移 · 滚轮缩放 · 点击节点看详情 · 双击分组折叠/展开']);
        this.canvas.appendChild(this.hint);
        this.empty = el('div', { class: 'tg-empty' }, ['请选择一个任务，或等待会话加载…']);
        this.canvas.appendChild(this.empty);
        this.detail = el('div', { class: 'tg-detail', hidden: '' });

        const main = el('div', { class: 'tg-main' }, [this.canvas, this.detail]);

        // trajectory drawer
        this.traj = el('div', { class: 'tg-traj', hidden: '' });

        this.root.append(top, main, this.traj);
        this.renderer = new GraphRenderer(this.canvas, this);
        this._buildFilterPop();
        this._buildTaskPicker();

        this.canvas.addEventListener('click', () => { this.selectNode(null); });

        if (!this.standalone) {
          document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape' && this.opened) this.close();
          });
        }
      }

      /* ---------- toolbar state ---------- */
      setLayout(mode) {
        this.layoutMode = mode;
        for (const [k, b] of Object.entries(this.layoutBtns)) b.toggleAttribute('data-on', k === mode);
        this.render(true);
      }
      toggleCP() {
        this.cpOn = !this.cpOn;
        this.cpBtn.toggleAttribute('data-on', this.cpOn);
        this.render();
      }
      toggleTraj() {
        this.trajOpen = !this.trajOpen;
        this.trajBtn.toggleAttribute('data-on', this.trajOpen);
        this.traj.hidden = !this.trajOpen;
        if (this.trajOpen) this._renderTraj();
      }
      toggleCollapse(id) {
        if (this.collapsed.has(id)) this.collapsed.delete(id);
        else this.collapsed.add(id);
        this.render();
      }

      /* ---------- data loading ---------- */
      async loadTasks() {
        try {
          const res = await api('/tasks?roots=true&limit=200');
          this.tasks = res.tasks ?? [];
        } catch (err) {
          this.tasks = [];
          this._setError(`无法加载任务列表: ${err.message}`);
        }
        this._renderTaskPicker();
      }

      async loadTask(ref) {
        this.current = this.tasks.find((t) => t.ref === ref) ?? { ref, id: ref, title: ref };
        this.taskBtn.textContent = truncate(this.current.title || this.current.id, 40);
        this.selected = null;
        this.detail.hidden = true;
        this.collapsed.clear();
        this.cpOn = false;
        this.cpBtn.removeAttribute('data-on');
        this.empty.style.display = 'flex';
        this.empty.textContent = '正在构建执行图谱…';
        this._stopLive();
        try {
          const [graph, events] = await Promise.all([
            api(`/task?id=${encodeURIComponent(ref)}`),
            api(`/events?id=${encodeURIComponent(ref)}`),
          ]);
          if (graph.error) throw new Error(graph.error);
          this.graph = graph;
          this.index = buildIndex(graph);
          this.events = events.events ?? [];
          this._mapSeqToNode();
          this._autoCollapseLarge();
          this.empty.style.display = 'none';
          this.render(true);
          this._renderTraj();
          if (this.current.live || graph.status === 'RUNNING') this._startLive(ref);
        } catch (err) {
          this._setError(`加载图谱失败: ${err.message}`);
        }
      }

      _mapSeqToNode() {
        this.seqToNode.clear();
        if (!this.graph) return;
        for (const n of this.graph.nodes) {
          for (const seq of n.event_ids ?? []) {
            if (!this.seqToNode.has(seq)) this.seqToNode.set(seq, n.id);
          }
        }
      }

      _autoCollapseLarge() {
        // Keep the graph readable on big sessions: collapse deep turns, keep
        // the first/last couple expanded for orientation (spec §12).
        if (!this.graph) return;
        const phases = this.graph.nodes.filter((n) => n.type === 'phase');
        if (phases.length > 14) {
          const sorted = [...phases].sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0));
          for (const p of sorted.slice(2, -2)) this.collapsed.add(p.id);
        }
      }

      /* ---------- live updates ---------- */
      _startLive(ref) {
        this._stopLive();
        this.badge.setAttribute('data-status', 'RUNNING');
        this.badge.innerHTML = '<span class="tg-dot"></span> LIVE';
        try {
          const es = new EventSource(`${API_BASE}/live?id=${encodeURIComponent(ref)}`);
          this.liveSource = es;
          const refresh = debounce(() => {
            if (this.current?.ref === ref) this.loadTask(ref);
          }, 1500);
          es.addEventListener('events', () => refresh());
          es.addEventListener('tick', (ev) => {
            try {
              const data = JSON.parse(ev.data);
              if (data.live === false) { this._stopLive(); this.loadTask(ref); }
            } catch { /* ignore */ }
          });
          es.onerror = () => { /* EventSource auto-reconnects */ };
        } catch { /* live optional */ }
      }
      _stopLive() {
        if (this.liveSource) { this.liveSource.close(); this.liveSource = null; }
      }

      /* ---------- render ---------- */
      render(fit = false) {
        if (!this.graph) return;
        const vis = computeVisibility(this.graph, this.index, this.hiddenTypes, this.collapsed);
        let layout;
        if (this.layoutMode === 'timeline') layout = layoutTimeline(this.graph, vis);
        else if (this.layoutMode === 'force') layout = layoutForce(this.graph, vis);
        else layout = layoutDAG(this.graph, vis);

        const searchHits = this._searchHits(vis);
        const cp = this.cpOn ? this.graph.critical_path : null;
        this.renderer.render(this.graph, vis, layout, {
          selected: this.selected,
          criticalPath: cp,
          searchHits: searchHits.size ? searchHits : null,
        });
        this._renderSummary();
        this._renderBadge();
        if (searchHits.size > 0 && this.selected === null) {
          this.renderer.setDim(null);
        }
        if (fit) requestAnimationFrame(() => this.renderer.fit());
      }

      _searchHits(vis) {
        const hits = new Set();
        if (!this.searchTerm) return hits;
        const q = this.searchTerm.toLowerCase();
        for (const n of vis.visible) {
          const hay = [n.name, n.id, n.meta?.tool_name, n.meta?.model, n.meta?.file, n.meta?.skill, n.meta?.command]
            .filter(Boolean).join(' ').toLowerCase();
          if (hay.includes(q)) hits.add(n.id);
        }
        return hits;
      }

      _renderBadge() {
        const status = this.graph?.status ?? 'PENDING';
        this.badge.setAttribute('data-status', status);
        this.badge.innerHTML = `<span class="tg-dot"></span> ${STATUS_TEXT[status] ?? status}`;
      }

      _renderSummary() {
        this.summary.replaceChildren();
        if (!this.graph) return;
        const s = this.graph.summary ?? {};
        const c = s.counts ?? {};
        const add = (label, value, cls) => {
          if (value === 0 || value === null || value === undefined || value === '—') return;
          this.summary.appendChild(el('span', { class: `tg-chip ${cls ?? ''}` }, [`${label} `, el('b', {}, [String(value)])]));
        };
        add('耗时', fmtDuration(this.graph.duration_ms));
        add('Turns', c.phases);
        add('Agent', c.agents);
        add('Tools', c.tools);
        add('Skill', c.skills);
        add('SubAgent', c.subagents);
        add('代码改动', c.code_changes);
        add('测试', c.tests);
        add('重试', c.retries, c.retries ? 'tg-chip-warn' : '');
        add('错误', c.errors, c.errors ? 'tg-chip-err' : '');
        add('文件', c.files_changed);
        const tk = s.tokens ?? {};
        if (tk.total) add('Tokens', `${fmtNum(tk.input)}→${fmtNum(tk.output)}`);
        // insights
        const cp = this.graph.critical_path;
        if (cp && cp.duration_ms > 0) {
          this.summary.appendChild(el('span', { class: 'tg-chip tg-insight' },
            [`⚡ 关键路径 `, el('b', {}, [fmtDuration(cp.duration_ms)]), ` / ${cp.hot_node_ids.length} 节点`]));
        }
        if (s.slowest_steps?.[0]) {
          this.summary.appendChild(el('span', { class: 'tg-chip tg-insight' },
            [`⏱ 最慢 `, el('b', {}, [truncate(s.slowest_steps[0].name, 18)]), ` ${fmtDuration(s.slowest_steps[0].duration_ms)}`]));
        }
        if (s.most_used_tools?.[0]) {
          this.summary.appendChild(el('span', { class: 'tg-chip tg-insight' },
            [`🛠 高频 `, el('b', {}, [s.most_used_tools[0].name]), ` ×${s.most_used_tools[0].calls}`]));
        }
      }

      _setError(msg) {
        this.empty.style.display = 'flex';
        this.empty.textContent = msg;
      }

      /* ---------- node interactions ---------- */
      selectNode(id) {
        this.selected = id;
        this.render();
        if (!id) { this.detail.hidden = true; return; }
        this._renderDetail(id);
        this.detail.hidden = false;
        this._highlightTrajRow(id);
      }

      hoverNode(id, on) {
        if (on) {
          const neighbors = new Set([id]);
          const edgeSet = new Set();
          for (const e of this.graph?.edges ?? []) {
            if (e.source === id || e.target === id) {
              neighbors.add(e.source); neighbors.add(e.target); edgeSet.add(e.id);
            }
          }
          this.renderer.setDim(neighbors);
          this.renderer.highlightEdges(edgeSet, 'dim');
        } else {
          this.renderer.setDim(null);
          this.renderer.highlightEdges(null);
        }
      }

      focusOnRunning() {
        const running = this.graph?.nodes.find((n) => n.status === 'RUNNING');
        if (running) { this.selectNode(running.id); this.renderer.focusNode(running.id); }
      }

      /* ---------- detail panel ---------- */
      _renderDetail(id) {
        const n = this.index?.byId.get(id);
        this.detail.replaceChildren();
        if (!n) return;
        const head = el('div', { class: 'tg-detail-head' }, [
          el('span', { class: 'tg-badge', 'data-status': n.status }, [
            el('span', { class: 'tg-dot' }), ` ${STATUS_TEXT[n.status] ?? n.status}`,
          ]),
          el('h3', {}, [n.name || n.id]),
          el('button', { class: 'tg-x', onclick: () => this.selectNode(null) }, ['✕']),
        ]);
        const body = el('div', { class: 'tg-detail-body' });

        const kv = el('dl', { class: 'tg-kv' });
        const row = (k, v) => {
          if (v === null || v === undefined || v === '') return;
          kv.appendChild(el('dt', {}, [k]));
          kv.appendChild(el('dd', {}, [String(v)]));
        };
        row('类型', TYPE_LABEL[n.type] ?? n.type);
        row('节点 ID', n.id);
        row('开始', fmtClock(n.start_time));
        row('结束', fmtClock(n.end_time));
        row('耗时', fmtDuration(n.duration_ms));
        if (n.type === 'agent') {
          row('Provider', n.meta?.provider);
          row('Model', n.meta?.model);
          const t = n.meta?.tokens;
          if (t) row('Tokens', `输入 ${fmtNum(t.input)} · 输出 ${fmtNum(t.output)}${t.cache_read ? ` · 缓存 ${fmtNum(t.cache_read)}` : ''}`);
          row('结束原因', n.meta?.finish_reason);
          row('工具调用', n.meta?.tool_call_count);
        }
        if (n.type === 'tool' || n.type === 'test' || n.type === 'code' || n.type === 'skill' || n.type === 'subagent') {
          row('工具', n.meta?.tool_name);
          row('文件', n.meta?.file);
        }
        if (n.type === 'skill') row('Skill', n.meta?.arguments?.name);
        if (n.type === 'subagent' && n.meta?.child_session) {
          row('子任务', truncate(n.meta.child_session.title, 40));
        }
        row('Trajectory 事件', (n.event_ids ?? []).length);
        body.appendChild(kv);

        // attempts / retry history
        const attempts = n.meta?.attempts ?? [];
        if (attempts.length > 1 || (n.type === 'agent' && attempts.length > 0)) {
          body.appendChild(el('div', { class: 'tg-sec' }, ['重试历史']));
          const list = el('div', { style: 'display:flex;flex-direction:column;gap:6px' });
          const items = n.type === 'agent'
            ? attempts.map((a) => ({ label: `LLM 重试 #${a.retry}/${a.max_retries ?? '?'}`, status: 'RETRYING', error: a.failure?.message, time: a.time }))
            : attempts.map((a) => ({
              label: `尝试 #${a.attempt}`,
              status: a.status,
              error: typeof a.error === 'string' ? a.error : (a.error?.message ?? (a.error ? pretty(a.error) : null)),
              time: a.start_time,
            }));
          for (const a of items) {
            list.appendChild(el('div', { class: 'tg-attempt', 'data-status': a.status }, [
              el('div', {}, [el('b', {}, [a.label]), ` · ${STATUS_TEXT[a.status] ?? a.status} · ${fmtClock(a.time)}`]),
              a.error ? el('div', {}, [truncate(a.error, 200)]) : null,
            ]));
          }
          body.appendChild(list);
        }

        // error
        if (n.meta?.error) {
          body.appendChild(el('div', { class: 'tg-sec' }, ['错误']));
          const errText = n.meta.error.message ?? pretty(n.meta.error);
          body.appendChild(el('pre', { class: 'tg-pre tg-err' }, [errText]));
        }

        // input / output
        if (n.meta?.arguments !== undefined && n.meta?.arguments !== null) {
          body.appendChild(el('div', { class: 'tg-sec' }, ['输入 / Input']));
          body.appendChild(el('pre', { class: 'tg-pre' }, [pretty(n.meta.arguments)]));
        }
        if (n.meta?.output) {
          body.appendChild(el('div', { class: 'tg-sec' }, ['输出 / Output']));
          body.appendChild(el('pre', { class: 'tg-pre' }, [n.meta.output]));
        }
        if (n.meta?.output_preview && !n.meta?.output) {
          body.appendChild(el('div', { class: 'tg-sec' }, ['输出 / Output']));
          body.appendChild(el('pre', { class: 'tg-pre' }, [n.meta.output_preview]));
        }
        if (n.type === 'plan' && n.meta?.todos) {
          body.appendChild(el('div', { class: 'tg-sec' }, ['计划 / Todos']));
          body.appendChild(el('pre', { class: 'tg-pre' }, [n.meta.todos.map((t) => `${t.status === 'completed' ? '✓' : '○'} ${t.content}`).join('\n')]));
        }

        // subagent drill-down
        if (n.type === 'subagent' && n.meta?.child_session?.ref) {
          const ref = n.meta.child_session.ref;
          body.appendChild(el('div', { class: 'tg-sec' }, ['子任务']));
          body.appendChild(el('button', { class: 'tg-link', onclick: () => this.loadTask(ref) },
            [`打开子任务图谱 → ${truncate(n.meta.child_session.title ?? ref, 30)}`]));
        }

        // trajectory linkage
        const evIds = n.event_ids ?? [];
        if (evIds.length) {
          body.appendChild(el('div', { class: 'tg-sec' }, [`对应 Trajectory 事件 (${evIds.length})`]));
          const list = el('div', { style: 'display:flex;flex-direction:column;gap:4px' });
          for (const seq of evIds.slice(0, 24)) {
            const ev = this.events.find((e) => e.seq === seq);
            const r = el('div', { class: 'tg-evrow' }, [
              el('code', {}, [`#${seq}`]),
              el('span', {}, [ev ? `${ev.type} · ${truncate(ev.summary, 40)}` : '']),
            ]);
            r.style.cursor = 'pointer';
            r.addEventListener('click', () => {
              if (!this.trajOpen) this.toggleTraj();
              this._highlightTrajRow(n.id, seq);
            });
            list.appendChild(r);
          }
          body.appendChild(list);
        }

        this.detail.append(head, body);
      }

      /* ---------- trajectory drawer ---------- */
      _renderTraj() {
        this.traj.replaceChildren();
        const head = el('div', { class: 'tg-traj-head' }, [
          el('b', {}, [`Trajectory · ${this.events.length} 事件`]),
          el('span', { style: 'color:var(--tg-text3);font-size:11px' }, ['点击事件行定位图谱节点']),
          el('span', { class: 'tg-spacer' }),
          el('button', { class: 'tg-x', onclick: () => this.toggleTraj() }, ['✕']),
        ]);
        const list = el('div', { class: 'tg-traj-list' });
        this.trajList = list;
        const frag = document.createDocumentFragment();
        const MAX = 2000;
        const rows = this.events.slice(0, MAX);
        for (const ev of rows) {
          const nodeId = this.seqToNode.get(ev.seq);
          const r = el('div', {
            class: 'tg-traj-row',
            'data-seq': ev.seq,
            ...(nodeId ? { 'data-node': nodeId } : {}),
            ...(ev.type.includes('result') && ev.summary.startsWith('✗') ? { 'data-err': '' } : {}),
          }, [
            el('span', { class: 'tg-ttime' }, [fmtClock(ev.time).split(' ')[1] ?? '']),
            el('span', { class: 'tg-tseq' }, [String(ev.seq)]),
            el('span', { class: 'tg-ttype' }, [ev.type]),
            el('span', { class: 'tg-tsum' }, [ev.summary]),
          ]);
          r.addEventListener('click', () => {
            if (nodeId) { this.selectNode(nodeId); this.renderer.focusNode(nodeId); }
            this._showEventDetail(ev);
          });
          frag.appendChild(r);
        }
        if (this.events.length > MAX) {
          frag.appendChild(el('div', { style: 'padding:8px 12px;color:var(--tg-text3);font-size:11px' },
            [`… 仅显示前 ${MAX} 条（共 ${this.events.length}）`]));
        }
        list.appendChild(frag);
        this.traj.append(head, list);
        // restore linkage highlight for the currently selected node
        if (this.selected) this._highlightTrajRow(this.selected);
      }

      _highlightTrajRow(nodeId, seq) {
        if (!this.trajList) return;
        this.trajList.querySelectorAll('.tg-hit').forEach((r) => r.classList.remove('tg-hit'));
        const target = seq !== undefined
          ? this.trajList.querySelector(`.tg-traj-row[data-seq="${seq}"]`)
          : this.trajList.querySelector(`.tg-traj-row[data-node="${cssEsc(nodeId)}"]`);
        if (target) {
          target.classList.add('tg-hit');
          target.scrollIntoView({ block: 'center' });
        }
      }

      _showEventDetail(ev) {
        // lightweight: expand summary into an alert-free inline modal
        const existing = this.root.querySelector('.tg-evmodal');
        if (existing) existing.remove();
        const box = el('div', {
          class: 'tg-evmodal',
          style: 'position:absolute;z-index:80;left:50%;top:60px;transform:translateX(-50%);max-width:560px;width:90%;background:var(--tg-bg2);border:1px solid var(--tg-border2);border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.5);display:flex;flex-direction:column;max-height:70%',
        }, [
          el('div', { class: 'tg-detail-head' }, [
            el('h3', {}, [`${ev.type} · #${ev.seq}`]),
            el('button', { class: 'tg-x', onclick: () => box.remove() }, ['✕']),
          ]),
          el('div', { style: 'padding:10px 12px;overflow:auto' }, [
            el('pre', { class: 'tg-pre' }, [pretty(ev.data)]),
          ]),
        ]);
        this.root.appendChild(box);
      }

      /* ---------- task picker ---------- */
      _buildTaskPicker() {
        this.taskPop = el('div', { class: 'tg-pop' });
        this.root.appendChild(this.taskPop);
      }
      _toggleTaskPicker() {
        if (this.taskPop.dataset.open) { delete this.taskPop.dataset.open; return; }
        this._renderTaskPicker();
        const rect = this.taskBtn.getBoundingClientRect();
        const rootRect = this.root.getBoundingClientRect();
        this.taskPop.style.left = `${rect.left - rootRect.left}px`;
        this.taskPop.style.top = `${rect.bottom - rootRect.top + 4}px`;
        this.taskPop.dataset.open = 'true';
        const close = (ev) => {
          if (!this.taskPop.contains(ev.target) && ev.target !== this.taskBtn) {
            delete this.taskPop.dataset.open;
            document.removeEventListener('click', close);
          }
        };
        setTimeout(() => document.addEventListener('click', close), 0);
      }
      _renderTaskPicker() {
        this.taskPop.replaceChildren();
        const search = el('input', { class: 'tg-search', placeholder: '过滤任务…', style: 'margin:8px;width:calc(100% - 16px);flex:none;box-sizing:border-box' });
        const list = el('div');
        const renderRows = (filter) => {
          list.replaceChildren();
          const q = (filter ?? '').toLowerCase();
          for (const t of this.tasks) {
            if (q && !`${t.title} ${t.id} ${t.workspace}`.toLowerCase().includes(q)) continue;
            const row = el('div', {
              class: 'tg-task-row',
              ...(this.current?.ref === t.ref ? { 'data-active': '' } : {}),
            }, [
              el('div', { class: 'tg-tr1' }, [
                el('span', { class: 'tg-badge', 'data-status': t.status, style: 'flex:none' }, [el('span', { class: 'tg-dot' })]),
                el('span', {}, [t.title || t.id]),
              ]),
              el('div', { class: 'tg-tr2' }, [
                `${fmtClock(t.createdAt)}`,
                `steps ${t.counts.steps} · tools ${t.counts.tools}`,
                t.depth > 0 ? `depth ${t.depth}` : '',
              ]),
            ]);
            row.addEventListener('click', () => {
              delete this.taskPop.dataset.open;
              this.loadTask(t.ref);
            });
            list.appendChild(row);
          }
        };
        search.addEventListener('input', () => renderRows(search.value));
        renderRows('');
        this.taskPop.append(search, list);
      }

      /* ---------- filter popover ---------- */
      _buildFilterPop() {
        this.root.appendChild(this.filterPop);
      }
      _toggleFilterPop(ev) {
        ev.stopPropagation();
        if (this.filterPop.dataset.open) { delete this.filterPop.dataset.open; return; }
        this.filterPop.replaceChildren();
        for (const type of FILTER_TYPES) {
          const checked = !this.hiddenTypes.has(type);
          const label = el('label', { style: 'display:flex;gap:8px;align-items:center;padding:6px 12px;font-size:12.5px;cursor:pointer;color:var(--tg-text2)' }, [
            el('input', { type: 'checkbox', ...(checked ? { checked: '' } : {}) }),
            el('span', { style: `color:${TYPE_COLOR[type]}` }, [`■`]),
            el('span', {}, [TYPE_LABEL[type] ?? type]),
          ]);
          label.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) this.hiddenTypes.delete(type);
            else this.hiddenTypes.add(type);
            this.render();
          });
          this.filterPop.appendChild(label);
        }
        const rect = this.filterBtn.getBoundingClientRect();
        const rootRect = this.root.getBoundingClientRect();
        this.filterPop.style.right = `${rootRect.right - rect.right}px`;
        this.filterPop.style.top = `${rect.bottom - rootRect.top + 4}px`;
        this.filterPop.style.left = 'auto';
        this.filterPop.dataset.open = 'true';
        const close = (e) => {
          if (!this.filterPop.contains(e.target) && e.target !== this.filterBtn) {
            delete this.filterPop.dataset.open;
            document.removeEventListener('click', close);
          }
        };
        setTimeout(() => document.addEventListener('click', close), 0);
      }

      /* ---------- export ---------- */
      exportGraph() {
        if (!this.graph) return;
        const blob = new Blob([JSON.stringify(this.graph, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `task-graph-${this.graph.session_id ?? 'task'}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }

      /* ---------- lifecycle ---------- */
      async open(initialRef) {
        this.opened = true;
        await this.loadTasks();
        if (initialRef) await this.loadTask(initialRef);
        else if (!this.current && this.tasks.length > 0) await this.loadTask(this.tasks[0].ref);
        this.render(true);
      }
      close() {
        this.opened = false;
        this._stopLive();
      }
      dispose() {
        this._stopLive();
        this.root.remove();
      }
    }

    /* ================================================================ *
     * Mounting                                                         *
     * ================================================================ */
    const ENTRY_ATTR = 'data-dsh-taskgraph-entry';
    const ICON = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="3" cy="8" r="2"/><circle cx="12" cy="3.5" r="2"/><circle cx="12" cy="12.5" r="2"/><path d="M5 7.4 10 4M5 8.6 10 12"/></svg>';

    function sidebarRoot() {
      const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');
      if (column === null) return undefined;
      return column.querySelector('[class*="logoRow"]')?.parentElement ?? column.firstElementChild;
    }
    function newSessionButton(root) {
      const nested = root.querySelector('button[class*="newSession"]');
      if (nested !== null) return nested;
      for (const child of root.children) if (child.tagName === 'BUTTON') return child;
      return undefined;
    }

    let app = null;

    function setActive(active) {
      document.documentElement.toggleAttribute('data-dsh-taskgraph-active', active);
    }

    function ensureView() {
      const host = document.querySelector('[data-pane="conversation"], [class*="centerCol"]');
      let view = document.querySelector('[data-dsh-taskgraph-view]');
      if (view) return view;
      view = document.createElement('div');
      view.setAttribute('data-dsh-taskgraph-view', '');
      if (host) host.appendChild(view);
      else {
        view.classList.add('tg-standalone');
        document.body.appendChild(view);
      }
      return view;
    }

    function toggleGraph(initialRef) {
      injectCss();
      const active = document.documentElement.hasAttribute('data-dsh-taskgraph-active');
      if (active) {
        setActive(false);
        app?.close();
        syncEntry();
        return;
      }
      const view = ensureView();
      if (!app || app.root !== view) {
        app?.dispose();
        app = new App(view);
      }
      setActive(true);
      syncEntry();
      app.open(initialRef);
    }

    let entryEl = null;
    function syncEntry() {
      if (!entryEl) return;
      const active = document.documentElement.hasAttribute('data-dsh-taskgraph-active');
      if (active) entryEl.setAttribute('data-active', '');
      else entryEl.removeAttribute('data-active');
    }

    function createEntry() {
      const entry = document.createElement('button');
      entry.type = 'button';
      entry.setAttribute(ENTRY_ATTR, '');
      entry.setAttribute('data-dsh-plugin', 'task-graph');
      entry.setAttribute('data-dsh-part', 'sidebar-entry');
      entry.setAttribute('aria-label', '任务执行图谱');
      entry.setAttribute('title', '任务执行图谱 (Task Flow Graph)');
      entry.innerHTML = `<span class="tg-entryIcon">${ICON}</span><span class="tg-entryLabel">执行图谱</span>`;
      entry.addEventListener('click', () => toggleGraph());
      return entry;
    }

    function placeEntry(root, entry) {
      const button = newSessionButton(root);
      const anchor = button
        ? (button.closest('[class*="logoRow"]')?.parentElement === root ? button.closest('[class*="logoRow"]') : button)
        : root.firstElementChild;
      if (!anchor) { root.appendChild(entry); return true; }
      if (entry.parentElement !== root) {
        root.insertBefore(entry, anchor.nextElementSibling);
      }
      return true;
    }

    function mountSidebarEntry() {
      if (document.querySelector(`[${ENTRY_ATTR}]`) !== null) return;
      entryEl = createEntry();
      let root;
      let placed = false;
      const tryPlace = () => {
        if (root !== undefined && !root.isConnected) { root = undefined; placed = false; }
        if (placed) {
          if (document.body.contains(entryEl)) return;
          root = undefined; placed = false;
        }
        root ??= sidebarRoot();
        if (root === undefined) return;
        placed = placeEntry(root, entryEl);
        if (placed) rootObserver.observe(root, { childList: true, subtree: true });
      };
      const waitObserver = new MutationObserver(() => tryPlace());
      waitObserver.observe(document.body, { childList: true, subtree: true });
      const rootObserver = new MutationObserver(() => {
        if (root === undefined || !root.isConnected) { placed = false; tryPlace(); return; }
        if (!root.contains(entryEl)) placed = placeEntry(root, entryEl);
      });
      tryPlace();
    }

    /**
     * Standalone boot (demo page / file:// preview): no DSH chrome, so mount a
     * floating toggle button instead of a sidebar entry.
     */
    function mountStandalone() {
      injectCss();
      const fab = document.createElement('button');
      fab.setAttribute(ENTRY_ATTR, '');
      fab.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:120;display:flex;align-items:center;gap:8px;'
        + 'padding:9px 14px;border-radius:10px;border:1px solid var(--tg-border2,#3d444d);'
        + 'background:var(--tg-bg2,#151b23);color:var(--tg-text,#e6edf3);cursor:pointer;font-size:13px;font-family:inherit;'
        + 'box-shadow:0 6px 24px rgba(0,0,0,.4)';
      fab.innerHTML = `${ICON}<span>任务执行图谱</span>`;
      fab.addEventListener('click', () => toggleGraph());
      document.body.appendChild(fab);
      // auto-open for an instant demo experience
      setTimeout(() => toggleGraph(), 60);
    }

    function hasDshShell() {
      return document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"], [data-dsh-frame]') !== null;
    }

    function boot() {
      if (document.querySelector('[data-dsh-taskgraph-view], [' + ENTRY_ATTR + ']')) return;
      if (hasDshShell()) mountSidebarEntry();
      else mountStandalone();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    return { toggleGraph, App };
  }

  // Register with the DSH client module loader when present (web UI), and
  // also run immediately so the standalone demo page works as a plain script.
  if (typeof window !== 'undefined' && window.__ModuleLoader__ && typeof window.__ModuleLoader__.load === 'function') {
    window.__ModuleLoader__.load({
      id: 'dsh-task-graph',
      immediately: true,
      factory: () => {
        const module = { exports: {} };
        module.exports = factory();
        return module.exports;
      },
    });
  } else if (typeof window !== 'undefined') {
    factory();
  }
})();




