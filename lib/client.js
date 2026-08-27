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
/* The graph mounts as a third tab (图谱) next to DSH's native 对话/轨迹 tabs.
   The injected tab button borrows the native tab classes at runtime; the view
   lives IN-FLOW inside the conversation pane, below the header, so the rest of
   the app (sidebar, header, tab bar) stays visible and usable. */
[data-dsh-taskgraph-view]{display:none;container:tg-view/inline-size;min-width:0;min-height:0}
html[data-dsh-taskgraph-active] [data-dsh-taskgraph-view]{display:flex;flex:1 1 auto}
html[data-dsh-taskgraph-active] [data-dsh-taskgraph-pane]>*:not([data-dsh-taskgraph-view]):not([data-dsh-taskgraph-keep]){display:none!important}
[data-dsh-taskgraph-view].tg-standalone{position:fixed;inset:0;z-index:200}
/* translucent treatment for native panes the client marks at runtime
   (currently: the 轨迹 view's opaque container) so it matches the
   see-through look of the 对话 pane. The marked container carries the
   subtle gradient; every inner surface underneath it goes transparent so
   nothing paints an opaque layer over the glass. */
[data-tg-glass]{background:linear-gradient(rgba(13,26,58,.08) 0%, rgba(10,20,44,.06) 100%)!important}
[data-tg-glass] [class*="_split"],[data-tg-glass] [class*="_table"],
[data-tg-glass] [class*="_body"],[data-tg-glass] [class*="_panel"],
[data-tg-glass] [class*="_content"],[data-tg-glass] [class*="_wrap"],
[data-tg-glass] [class*="_scroll"],[data-tg-glass] [class*="_main"],
[data-tg-glass] [class*="_container"],[data-tg-glass] [class*="_root"]{background:transparent!important}

[data-dsh-taskgraph-view]{
  /* glass theme: transparent surfaces so the skin wallpaper shines through,
     matching the native 对话 pane (same subtle gradient as its root) */
  --tg-bg:transparent;
  --tg-panel:color-mix(in srgb, var(--dsw-alias-bg-base,#101a33) 52%, transparent);
  --tg-bg2:color-mix(in srgb, var(--dsw-alias-bg-layer-2,#18223a) 62%, transparent);
  --tg-bg3:var(--dsw-alias-interactive-bg-hover,rgba(120,140,180,.14));
  --tg-border:color-mix(in srgb, var(--dsw-alias-border-l2,#33415e) 70%, transparent);
  --tg-border2:color-mix(in srgb, var(--dsw-alias-border-l3,#43537a) 75%, transparent);
  --tg-text:var(--dsw-alias-label-primary,#e6edf3);
  --tg-text2:var(--dsw-alias-label-secondary,#9aa4b2);
  --tg-text3:var(--dsw-alias-label-tertiary,#6e7681);
  --tg-accent:var(--dsw-alias-state-business-primary,#4c8dff);
  --tg-ok:var(--dsw-alias-state-success-primary,#2fbf71);
  --tg-err:var(--dsw-alias-state-error-primary,#f0475a);
  --tg-warn:var(--dsw-alias-state-warn-primary,#e8a33d);
  --tg-cancel:#a78bfa;
  --tg-input:color-mix(in srgb, var(--dsw-specific-input-major,#101a33) 55%, transparent);
  --tg-glass-blur:blur(14px);
  --tg-font:var(--dsw-font-family,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif);
  --tg-mono:var(--dsw-font-markdown-code-block-small,ui-monospace,SFMono-Regular,Menlo,monospace);
  background:linear-gradient(rgba(13,26,58,.08) 0%, rgba(10,20,44,.06) 100%);
  color:var(--tg-text);font-family:var(--tg-font);
  flex-direction:column;min-width:0;min-height:0;overflow:hidden;
}
.tg-top{flex:none;border-bottom:1px solid var(--tg-border);display:flex;flex-direction:column;background:transparent}
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
.tg-collapse circle{fill:var(--tg-bg2);stroke:var(--tg-border2)}
.tg-collapse:hover circle{stroke:var(--tg-accent)}
.tg-collapse path{stroke:var(--tg-text2);fill:none;stroke-width:1.4}
.tg-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--tg-text3);font-size:13px;flex-direction:column;gap:10px}

/* detail panel */
.tg-detail{width:360px;flex:none;border-left:1px solid var(--tg-border);background:var(--tg-panel);-webkit-backdrop-filter:var(--tg-glass-blur);backdrop-filter:var(--tg-glass-blur);display:flex;flex-direction:column;min-height:0}
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
.tg-pre{background:color-mix(in srgb, var(--dsw-alias-bg-base,#0d1424) 68%, transparent);border:1px solid var(--tg-border);border-radius:8px;padding:8px 10px;font-family:var(--tg-mono);font-size:11px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;margin:0;color:var(--tg-text2)}
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
.tg-traj{flex:none;border-top:1px solid var(--tg-border);background:var(--tg-panel);-webkit-backdrop-filter:var(--tg-glass-blur);backdrop-filter:var(--tg-glass-blur);height:230px;display:flex;flex-direction:column;min-height:0}
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
.tg-pop{position:absolute;z-index:70;background:var(--tg-panel);-webkit-backdrop-filter:var(--tg-glass-blur);backdrop-filter:var(--tg-glass-blur);border:1px solid var(--tg-border2);border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.4);max-height:420px;overflow:auto;display:none;min-width:320px}
.tg-pop[data-open]{display:block}
.tg-task-row{padding:8px 12px;cursor:pointer;border-bottom:1px solid color-mix(in srgb, var(--tg-border) 40%, transparent);display:flex;flex-direction:column;gap:2px}
.tg-task-row:hover,.tg-task-row[data-active]{background:var(--tg-bg3)}
.tg-task-row .tg-tr1{display:flex;gap:8px;align-items:center;font-size:12.5px}
.tg-task-row .tg-tr1 span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tg-task-row .tg-tr2{font-size:10.5px;color:var(--tg-text3);display:flex;gap:10px}

@media (max-width:900px){.tg-detail{position:absolute;right:0;top:0;bottom:0;z-index:65;box-shadow:-8px 0 24px rgba(0,0,0,.35)}}

/* ================================================================ *
 * Precision theme — Apple restraint · Linear density · Vercel      *
 * finish · live-agent execution feel. Overrides the defaults above. *
 * ================================================================ */
[data-dsh-taskgraph-view]{
  --tg-hairline:color-mix(in srgb, var(--dsw-alias-border-l2,#93a5c4) 24%, transparent);
  --tg-hairline-2:color-mix(in srgb, var(--dsw-alias-border-l3,#93a5c4) 40%, transparent);
  --tg-surface:color-mix(in srgb, var(--dsw-alias-bg-layer-2,#16223e) 44%, transparent);
  --tg-surface-2:color-mix(in srgb, var(--dsw-alias-bg-layer-2,#16223e) 62%, transparent);
  font-variant-numeric:tabular-nums;
}
[data-dsh-taskgraph-view] button,[data-dsh-taskgraph-view] input{font-variant-numeric:tabular-nums}

/* toolbar — quiet, hairline, compact */
.tg-top{border-bottom:1px solid var(--tg-hairline)}
.tg-toprow{gap:8px;padding:6px 12px}
.tg-title{font-size:13px;letter-spacing:-.01em}
.tg-title svg{width:16px;height:16px;opacity:.92}
.tg-select,.tg-search{border:1px solid var(--tg-hairline);border-radius:6px;font-size:12px;padding:4px 9px;transition:border-color .15s,background .15s}
.tg-select:hover,.tg-search:hover{border-color:var(--tg-hairline-2)}
.tg-select:focus,.tg-search:focus{border-color:color-mix(in srgb, var(--tg-accent) 60%, transparent)}
.tg-btn{border:1px solid var(--tg-hairline);border-radius:6px;padding:4px 9px;font-size:11.5px;letter-spacing:.01em;transition:background .15s,color .15s,border-color .15s}
.tg-btn:hover{background:var(--tg-surface);border-color:var(--tg-hairline-2);color:var(--tg-text)}
.tg-btn[data-on]{background:var(--tg-surface-2);border-color:var(--tg-hairline-2);color:var(--tg-text)}
.tg-seg{border-color:var(--tg-hairline);border-radius:6px}
.tg-seg .tg-btn{padding:4px 10px}
.tg-seg .tg-btn+.tg-btn{border-left:1px solid var(--tg-hairline)}
.tg-seg .tg-btn[data-on]{background:var(--tg-surface-2)}

/* badges — quiet uppercase micro-labels */
.tg-badge{border-radius:4px;padding:2px 7px;font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase}
.tg-badge .tg-dot{width:6px;height:6px}
.tg-badge[data-status=RUNNING]{border-color:color-mix(in srgb, var(--tg-accent) 55%, transparent)}
.tg-badge[data-status=SUCCESS]{border-color:color-mix(in srgb, var(--tg-ok) 50%, transparent)}
.tg-badge[data-status=FAILED]{border-color:color-mix(in srgb, var(--tg-err) 55%, transparent)}
.tg-badge[data-status=RETRYING]{border-color:color-mix(in srgb, var(--tg-warn) 55%, transparent)}
.tg-badge[data-status=CANCELLED]{border-color:color-mix(in srgb, var(--tg-cancel) 50%, transparent)}

/* summary strip — flat data readout */
.tg-summary{gap:6px;padding:4px 12px 8px}
.tg-chip{background:transparent;border:1px solid var(--tg-hairline);border-radius:6px;padding:2px 8px;font-size:11px}
.tg-chip b{font-size:11.5px;font-weight:600}

/* canvas grid — fainter, tighter */
.tg-canvas{background:radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--dsw-alias-border-l2,#93a5c4) 15%, transparent) 1px, transparent 1.5px) 0 0/24px 24px}
.tg-hint{font-size:10.5px;opacity:.75}

/* edges — hairlines; live data flow on active edges */
.tg-edge{stroke:color-mix(in srgb, var(--dsw-alias-border-l3,#93a5c4) 34%, transparent);stroke-width:1.2}
.tg-edge.tg-edge-flow{stroke:color-mix(in srgb, var(--tg-accent) 55%, transparent);stroke-dasharray:5 5;animation:tgFlow 1s linear infinite}
@keyframes tgFlow{to{stroke-dashoffset:-10}}
.tg-edge.tg-edge-retry{stroke:color-mix(in srgb, var(--tg-warn) 75%, transparent);stroke-width:1.2}
.tg-edge.tg-hot{stroke:var(--tg-warn);stroke-width:1.7}
.tg-edge.tg-neigh{stroke:var(--tg-accent);stroke-width:1.5}
.tg-arrowhead{fill:color-mix(in srgb, var(--dsw-alias-border-l3,#93a5c4) 46%, transparent)}

/* nodes — translucent type-tinted blocks over the glass pane;
   status stays readable via the corner dot + border emphasis */
.tg-node{--tg-tint:140,150,172}
.tg-node[data-type=task]{--tg-tint:104,152,232}
.tg-node[data-type=phase]{--tg-tint:126,142,196}
.tg-node[data-type=agent]{--tg-tint:108,172,192}
.tg-node[data-type=tool]{--tg-tint:142,152,174}
.tg-node[data-type=skill]{--tg-tint:168,142,204}
.tg-node[data-type=subagent]{--tg-tint:202,170,112}
.tg-node[data-type=plan]{--tg-tint:132,182,142}
.tg-node[data-type=code]{--tg-tint:212,162,118}
.tg-node[data-type=test]{--tg-tint:118,158,212}
.tg-node .tg-nodebox{fill:color-mix(in srgb, rgb(var(--tg-tint)) 15%, var(--tg-surface));stroke:color-mix(in srgb, rgb(var(--tg-tint)) 42%, transparent);stroke-width:1;transition:stroke .15s,fill .15s}
.tg-node:hover .tg-nodebox{fill:color-mix(in srgb, rgb(var(--tg-tint)) 22%, var(--tg-surface));stroke:color-mix(in srgb, rgb(var(--tg-tint)) 62%, transparent)}
.tg-node[data-status=RUNNING] .tg-nodebox{stroke:color-mix(in srgb, var(--tg-accent) 64%, transparent);stroke-width:1.2}
.tg-node[data-status=SUCCESS] .tg-nodebox{stroke:color-mix(in srgb, var(--tg-ok) 34%, var(--tg-hairline-2))}
.tg-node[data-status=FAILED] .tg-nodebox{stroke:color-mix(in srgb, var(--tg-err) 68%, transparent);stroke-width:1.2}
.tg-node[data-status=RETRYING] .tg-nodebox{stroke:color-mix(in srgb, var(--tg-warn) 64%, transparent);stroke-width:1.2}
.tg-node[data-status=CANCELLED] .tg-nodebox{stroke:color-mix(in srgb, var(--tg-cancel) 45%, var(--tg-hairline-2))}
.tg-node.tg-selected{filter:drop-shadow(0 0 7px color-mix(in srgb, var(--tg-accent) 30%, transparent))}
.tg-node.tg-selected .tg-nodebox{stroke:var(--tg-accent);stroke-width:1.4;filter:none}
.tg-node.tg-search-hit .tg-nodebox{stroke:var(--tg-warn);stroke-width:1.4;filter:none}
.tg-node.tg-cp .tg-nodebox{stroke:var(--tg-warn);stroke-width:1.4;filter:none}
.tg-node[data-status=RUNNING] .tg-pulse{animation:tgPulse 2.1s cubic-bezier(.4,0,.2,1) infinite}
@keyframes tgPulse{0%{stroke-opacity:.5;stroke-width:1.4}75%{stroke-opacity:0;stroke-width:11}100%{stroke-opacity:0;stroke-width:11}}
.tg-node .tg-nlabel{font-size:11.5px;letter-spacing:.01em}
.tg-node .tg-nmeta{font-size:9.5px;font-family:var(--tg-mono);fill:var(--tg-text3)}
.tg-node .tg-nbadge{font-size:9px}
.tg-ntype{font-size:8.5px;font-weight:700;letter-spacing:.09em;opacity:.8}
.tg-collapse circle{fill:var(--tg-surface-2);stroke:var(--tg-hairline-2)}
.tg-collapse path{stroke-width:1.2}

/* detail panel — Linear-density readout */
.tg-detail{width:340px;border-left:1px solid var(--tg-hairline)}
.tg-detail-head{padding:8px 12px;border-bottom:1px solid var(--tg-hairline)}
.tg-detail-head h3{font-size:12.5px;letter-spacing:-.01em}
.tg-detail-body{padding:10px 12px;gap:8px}
.tg-kv{grid-template-columns:84px 1fr;gap:3px 10px;font-size:11.5px}
.tg-kv dt{font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;padding-top:1.5px}
.tg-sec{font-size:9.5px;letter-spacing:.09em;margin-top:5px}
.tg-pre{font-size:10.5px;border-radius:6px;border-color:var(--tg-hairline);line-height:1.55}
.tg-attempt{border-radius:6px;border-color:var(--tg-hairline);font-size:11px;padding:5px 8px}
.tg-attempt[data-status=FAILED]{border-color:color-mix(in srgb, var(--tg-err) 45%, var(--tg-hairline))}
.tg-attempt[data-status=SUCCESS]{border-color:color-mix(in srgb, var(--tg-ok) 40%, var(--tg-hairline))}
.tg-x{border-radius:5px;font-size:13px}

/* trajectory drawer — dense monospace log */
.tg-traj{height:212px;border-top:1px solid var(--tg-hairline)}
.tg-traj-head{padding:5px 12px;border-bottom:1px solid var(--tg-hairline)}
.tg-traj-head b{font-size:11.5px;letter-spacing:.01em}
.tg-traj-list{font-size:10.5px}
.tg-traj-row{grid-template-columns:64px 44px 138px 1fr;gap:8px;padding:2.5px 12px;border-bottom:1px solid color-mix(in srgb, var(--dsw-alias-border-l2,#93a5c4) 12%, transparent)}
.tg-traj-row.tg-hit{background:color-mix(in srgb, var(--tg-accent) 12%, transparent);outline:1px solid color-mix(in srgb, var(--tg-accent) 50%, transparent)}
.tg-traj-row .tg-ttype{color:color-mix(in srgb, var(--tg-accent) 78%, var(--tg-text2))}

/* popovers — lifted, hairline ring */
.tg-pop{border-radius:8px;border-color:var(--tg-hairline-2);box-shadow:0 12px 36px rgba(2,8,24,.45),0 0 0 1px color-mix(in srgb, var(--dsw-alias-border-l2,#93a5c4) 10%, transparent)}
.tg-task-row{padding:7px 12px;border-bottom:1px solid color-mix(in srgb, var(--dsw-alias-border-l2,#93a5c4) 12%, transparent)}
.tg-task-row .tg-tr1{font-size:12px}
.tg-task-row .tg-tr2{font-size:10px}

/* phase activity list (detail panel) */
.tg-act{display:flex;flex-direction:column;gap:1px;max-height:360px;overflow-y:auto;scrollbar-width:thin;border:1px solid var(--tg-hairline);border-radius:6px;padding:2px}
.tg-act-step{font-size:10px;color:var(--tg-text3);font-family:var(--tg-mono);padding:4px 6px 2px;border-top:1px solid var(--tg-hairline)}
.tg-act-step:first-child{border-top:none}
.tg-act-tool{display:grid;grid-template-columns:64px 1fr auto;gap:6px;align-items:baseline;font-size:10.5px;padding:2px 6px 2px 14px;border-radius:4px;cursor:pointer;color:var(--tg-text2)}
.tg-act-tool:hover{background:var(--tg-bg3)}
.tg-act-name{color:var(--tg-text);font-family:var(--tg-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tg-act-args{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tg-text3)}
.tg-act-dur{font-family:var(--tg-mono);white-space:nowrap;color:var(--tg-text3)}
.tg-act-tool[data-status=FAILED] .tg-act-dur{color:var(--tg-err)}
.tg-act-tool[data-status=SUCCESS] .tg-act-dur{color:color-mix(in srgb, var(--tg-ok) 70%, var(--tg-text3))}

@media (max-width:900px){.tg-detail{box-shadow:-12px 0 32px rgba(2,8,24,.4)}}
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
      // restrained palette: neutrals first, desaturated hue hints only
      task: 'var(--tg-accent)', phase: '#8ea0bf', agent: '#7fa8b8', tool: '#8b94a3',
      skill: '#a18fc0', subagent: '#bfa77e', plan: '#8fae90', code: '#bd9a80', test: '#84a3c4',
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
    /** Wrap a label into up to maxLines lines; CJK chars count double-width. */
    function wrapName(raw, maxUnits = 18, maxLines = 2) {
      const text = String(raw ?? '');
      const lines = [];
      let cur = '';
      let units = 0;
      let rest = false;
      for (const ch of text) {
        const w = ch.codePointAt(0) > 0x2e7f ? 2 : 1;
        if (units + w > maxUnits) {
          lines.push(cur);
          cur = '';
          units = 0;
          if (lines.length === maxLines) { rest = true; break; }
        }
        cur += ch;
        units += w;
      }
      if (!rest && cur) lines.push(cur);
      if (rest && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -1)}…`;
      return lines.length ? lines : [''];
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

    /** Default task on first open: a live task first, else the most recent
     *  task that actually contains execution data (avoid empty/abandoned
     *  sessions that make the graph look broken), else the most recent. */
    function pickDefaultTask(tasks) {
      return tasks.find((t) => t.live)
        ?? tasks.find((t) => (t.counts?.steps ?? 0) >= 2)
        ?? tasks.find((t) => (t.counts?.tools ?? 0) >= 1)
        ?? tasks[0];
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
    const NODE_W = 136;
    const NODE_H = 94;
    const H_GAP = 18;
    const V_GAP = 42;

    function layoutDAG(graph, vis, dir = 'tb') {
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

      // coordinates — TB stacks layers downward, LR flows them left→right


      // (LR suits the landscape conversation pane).


      if (dir === 'lr') {


        const WITHIN = 16;   // vertical gap inside a column


        const LAYER = 52;    // horizontal gap between columns


        let height = 0;


        for (const row of layers) {


          const colH = row.length * (NODE_H + WITHIN) - WITHIN;


          height = Math.max(height, colH);


        }


        let x = 0;


        layers.forEach((row) => {


          const colH = row.length * (NODE_H + WITHIN) - WITHIN;


          let y = (height - colH) / 2;


          for (const n of row) {


            pos.set(n.id, { x, y, w: NODE_W, h: NODE_H });


            y += NODE_H + WITHIN;


          }


          x += NODE_W + LAYER;


        });


        return { pos, width: x - LAYER, height, layers, dir };


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
      return { pos, width, height: maxH, layers, dir };
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
        // live-execution feel: nodes currently running, and the edges
        // carrying work into/out of them get an animated flow.
        const runningIds = new Set();
        for (const n of graph.nodes) if (n.status === 'RUNNING') runningIds.add(n.id);

        // ---- edges ----
        for (const e of graph.edges) {
          const as = vis.anchor(e.source);
          const at = vis.anchor(e.target);
          const s = layout.pos.get(as);
          const t = layout.pos.get(at);
          if (!s || !t) continue;
          if (as === at) {
            if (e.type === 'retries') this._drawRetryArc(layout.pos.get(e.source), e, layout.dir);
            continue;
          }
          const d = this._edgePath(s, t, layout);
          const cls = ['tg-edge'];
          if (e.type === 'retries') cls.push('tg-edge-retry');
          let marker = 'url(#tg-arrow)';
          if (hotEdges && hotEdges.has(e.id)) { cls.push('tg-hot'); marker = 'url(#tg-arrow-hot)'; }
          else if (runningIds.has(e.source) || runningIds.has(e.target) || runningIds.has(as) || runningIds.has(at)) cls.push('tg-edge-flow');
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
        this._startLiveTicker(runningIds);
      }

      /** Ticking elapsed time on RUNNING nodes — the "executing right now" cue. */
      _startLiveTicker(runningIds) {
        this._stopLiveTicker();
        if (!runningIds.size) return;
        this._liveTick = setInterval(() => {
          const now = Date.now();
          for (const id of runningIds) {
            const g = this.nodeLayer.querySelector(`.tg-node[data-id="${cssEsc(id)}"]`);
            if (!g) continue;
            const start = Number(g.getAttribute('data-start'));
            const meta = g.querySelector('.tg-nmeta');
            if (meta && start) meta.textContent = `${fmtDuration(now - start)} · running`;
          }
        }, 1000);
      }
      _stopLiveTicker() {
        if (this._liveTick) { clearInterval(this._liveTick); this._liveTick = null; }
      }

      _edgePath(s, t, layout) {
        if (layout.timeline) {
          const sx = s.x + s.w;
          const sy = s.y + s.h / 2;
          const tx = t.x;
          const ty = t.y + t.h / 2;
          const mx = (sx + tx) / 2;
          return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
        }
        if (layout.dir === 'lr') {

          // horizontal flow: right side → left side

          const sx = s.x + s.w;

          const sy = s.y + s.h / 2;

          const tx = t.x;

          const ty = t.y + t.h / 2;

          if (tx >= sx) {

            const dx = Math.max(22, (tx - sx) * 0.5);

            return `M${sx},${sy} C${sx + dx},${sy} ${tx - dx},${ty} ${tx},${ty}`;

          }

          // back edge → dip below both cards

          const dip = Math.max(s.y + s.h, t.y + t.h) + 42 - Math.min(sy, ty);

          return `M${sx},${sy} C${sx + 40},${sy + dip} ${tx - 40},${ty + dip} ${tx},${ty}`;

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

      _drawRetryArc(p, edge, dir) {
        if (!p) return;
        const attemptsTxt = edge.meta?.attempts ?? '';
        if (dir === 'lr') {
          const cx = p.x + p.w / 2;
          const cy = p.y + p.h;
          const r = 20;
          const d = `M${cx - 12},${cy} C${cx - 12},${cy + r} ${cx + 12},${cy + r} ${cx + 12},${cy}`;
          this.edgeLayer.appendChild(svgEl('path', {
            d, class: 'tg-edge tg-edge-retry', 'marker-end': 'url(#tg-arrow)', 'data-edge': edge.id,
          }));
          this.edgeLayer.appendChild(svgEl('text', {
            x: cx, y: cy + r + 12, 'text-anchor': 'middle', class: 'tg-nbadge', fill: 'var(--tg-warn)', 'font-size': '10',
          }, [`×${attemptsTxt}`]));
          return;
        }
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
          'data-type': n.type,
          'data-status': n.status,
        });
        if (flags.selected) g.classList.add('tg-selected');
        if (flags.cp) g.classList.add('tg-cp');
        if (flags.searchHit) g.classList.add('tg-search-hit');
        if (n.start_time != null) g.setAttribute('data-start', String(n.start_time));

        const statusStroke = {
          RUNNING: 'var(--tg-accent)', SUCCESS: 'var(--tg-ok)', FAILED: 'var(--tg-err)',
          RETRYING: 'var(--tg-warn)', CANCELLED: 'var(--tg-cancel)',
        }[n.status] || 'var(--tg-border2)';

        const RX = p.bar ? 6 : 14;
        if (n.status === 'RUNNING') {
          g.appendChild(svgEl('rect', {
            class: 'tg-pulse', x: 0, y: 0, width: p.w, height: p.h, rx: RX,
            fill: 'none', stroke: statusStroke, 'stroke-width': 1.4,
          }));
        }
        g.appendChild(svgEl('rect', {
          class: 'tg-nodebox', x: 0, y: 0, width: p.w, height: p.h, rx: RX,
        }));

        const dotColor = {
          RUNNING: 'var(--tg-accent)', SUCCESS: 'var(--tg-ok)', FAILED: 'var(--tg-err)',
          RETRYING: 'var(--tg-warn)', CANCELLED: 'var(--tg-cancel)',
        }[n.status] || 'var(--tg-text3)';
        const typeColor = TYPE_COLOR[n.type] || 'var(--tg-text2)';

        if (p.bar) {
          // timeline bar: one compact line
          g.appendChild(svgEl('circle', { cx: 10, cy: p.h / 2, r: 3, fill: dotColor }));
          g.appendChild(svgEl('text', {
            x: 19, y: p.h / 2 + 3.5, class: 'tg-nlabel',
          }, [truncate(`${(TYPE_LABEL[n.type] || n.type).toUpperCase()} · ${n.name || n.id}`, Math.max(8, Math.floor(p.w / 6.2))) ]));
        } else {
          // rounded card: type (top-left) · status dot (top-right) ·
          // name up to 2 lines · meta strip along the bottom
          g.appendChild(svgEl('text', {
            x: 12, y: 18, class: 'tg-ntype', fill: typeColor,
          }, [(TYPE_LABEL[n.type] || n.type).toUpperCase()]));
          g.appendChild(svgEl('circle', { cx: p.w - 15, cy: 14, r: 3.5, fill: dotColor }));

          const lines = wrapName(n.name || n.id);
          lines.forEach((ln, i) => {
            g.appendChild(svgEl('text', {
              x: 12, y: 42 + i * 15, class: 'tg-nlabel',
            }, [ln]));
          });

          const meta = this._nodeMeta(n);
          if (meta) {
            g.appendChild(svgEl('text', {
              x: 12, y: p.h - 12, class: 'tg-nmeta',
            }, [truncate(meta, 16)]));
          }
        }

        // collapse/expand affordance for groups with children (card: bottom-right)
        const childCount = this._countDescendants(n.id, vis);
        if (childCount > 0 && n.type !== 'tool') {
          const collapsed = vis.isCollapsed(n.id);
          const bx = p.bar ? p.w - 14 : p.w - 18;
          const by = p.bar ? p.h / 2 : p.h - 18;
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
        // expanded: direct visible children; collapsed: ALL descendants,
        // so the badge tells you how much is hidden behind the group.
        if (!vis.isCollapsed(id)) {
          let count = 0;
          for (const n of vis.visible) if (n.parent_id === id) count += 1;
          return count;
        }
        const graph = this.app?.viewGraph ?? this.app?.graph;
        if (!graph) return 0;
        const childrenOf = new Map();
        for (const n of graph.nodes) {
          if (!n.parent_id) continue;
          if (!childrenOf.has(n.parent_id)) childrenOf.set(n.parent_id, []);
          childrenOf.get(n.parent_id).push(n.id);
        }
        let total = 0;
        const stack = [...(childrenOf.get(id) ?? [])];
        while (stack.length) {
          const c = stack.pop();
          total += 1;
          for (const cc of childrenOf.get(c) ?? []) stack.push(cc);
        }
        return total;
      }

      _nodeMeta(n) {
        const parts = [];
        if (n.meta?.count) parts.push(`×${n.meta.count}${n.meta?.files ? ` · ${n.meta.files} files` : ''}`);
        if (n.type === 'phase' && n.meta?.key_summary) parts.push(n.meta.key_summary);
        if (n.duration_ms != null) parts.push(fmtDuration(n.duration_ms));
        if (n.type === 'agent') {
          const t = n.meta?.tokens;
          if (t && (t.input || t.output)) parts.push(`${fmtNum(t.input)}→${fmtNum(t.output)}`);
          if (n.meta?.model) parts.push(truncate(n.meta.model, 14));
        }
        if (n.type === 'tool' || n.type === 'test' || n.type === 'code') {
          const att = n.meta?.attempts?.length;
          if (att > 1) parts.push(`↻${att}`);
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
        this.dagDir = 'lr';      // horizontal DAG by default (conversation pane is landscape)
        this.keyView = true;     // default: KEY nodes only; specifics live in the detail panel
        this.viewGraph = null;   // graph currently rendered (key-derived or full)
        this.activeIndex = null;
        this._keyCache = null;
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

          this.dirBtn = el('button', { class: 'tg-btn', title: '切换图谱方向（横向 / 纵向）', onclick: () => this.toggleDir() }, ['⇄ 横向']);

          this.dirBtn.setAttribute('data-on', '');

          this.keyBtn = el('button', { class: 'tg-btn', title: '只保留关键节点；具体做了什么看节点详情', onclick: () => this.toggleKeyView() }, ['◆ 关键节点']);
          this.keyBtn.setAttribute('data-on', '');
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
          this.dirBtn, this.keyBtn, this.cpBtn, this.trajBtn,
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
      toggleDir() {

        this.dagDir = this.dagDir === 'lr' ? 'tb' : 'lr';

        this.dirBtn.textContent = this.dagDir === 'lr' ? '⇄ 横向' : '⇅ 纵向';

        this.dirBtn.toggleAttribute('data-on', this.dagDir === 'lr');

        this.render(true);

      }

      

      toggleKeyView() {
        this.keyView = !this.keyView;
        this.keyBtn.toggleAttribute('data-on', this.keyView);
        this.collapsed.clear();
        if (!this.keyView) this._autoCollapseLarge();
        this.render(true);
      }

      /**
       * Key-node view: the canvas shows only semantically important nodes —
       * turns plus plan/skill/subagent/code/test events and failures/retries.
       * Every other activity (each LLM step, each read/grep/bash) stays in
       * the data and is surfaced through the detail panel instead.
       */
      _deriveKeyGraph() {
        if (this._keyCache?.src === this.graph) return this._keyCache.kg;
        const full = this.graph;
        const KEY_TYPES = new Set(['plan', 'subagent', 'skill', 'code', 'test']);
        const nodes = [];
        const task = full.nodes.find((n) => n.type === 'task');
        if (task) nodes.push(task);
        const phases = full.nodes.filter((n) => n.type === 'phase')
          .sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0));

        const childrenOf = new Map();
        for (const n of full.nodes) {
          if (!n.parent_id) continue;
          if (!childrenOf.has(n.parent_id)) childrenOf.set(n.parent_id, []);
          childrenOf.get(n.parent_id).push(n);
        }
        const summarizePhase = (ph) => {
          let steps = 0; let tools = 0; let tokens = 0; let failed = 0; let retried = 0;
          for (const st of childrenOf.get(ph.id) ?? []) {
            if (st.type !== 'agent') continue;
            steps += 1;
            const t = st.meta?.tokens;
            if (t) tokens += (t.input ?? 0) + (t.output ?? 0);
            for (const tl of childrenOf.get(st.id) ?? []) {
              tools += 1;
              if (tl.status === 'FAILED') failed += 1;
              if ((tl.meta?.attempts?.length ?? 0) > 1) retried += 1;
            }
          }
          const parts = [`${steps} steps · ${tools} tools`];
          if (tokens) parts.push(`${fmtNum(tokens)} tok`);
          if (retried) parts.push(`↻${retried}`);
          if (failed) parts.push(`✗${failed}`);
          return parts.join(' · ');
        };

        const keyNodesByPhase = new Map();
        for (const ph of phases) {
          const p = { ...ph, parent_id: task?.id ?? null, meta: { ...ph.meta, key_summary: summarizePhase(ph) } };
          nodes.push(p);
          let kids = [];
          for (const st of childrenOf.get(ph.id) ?? []) {
            if (st.type !== 'agent') continue;
            if ((st.meta?.attempts?.length ?? 0) > 0) {
              kids.push({ ...st, parent_id: p.id, name: `LLM 重试 ×${st.meta.attempts.length}` });
            }
            for (const tl of childrenOf.get(st.id) ?? []) {
              const key = KEY_TYPES.has(tl.type) || tl.status === 'FAILED' || tl.meta?.retried === true;
              if (key) kids.push({ ...tl, parent_id: p.id });
            }
          }
          // multiple code edits in one turn collapse into a single key node;
          // the per-edit list lives in its detail panel.
          const codeKids = kids.filter((x) => x.type === 'code');
          if (codeKids.length > 2) {
            const failed = codeKids.some((c) => c.status === 'FAILED');
            const running = codeKids.some((c) => c.status === 'RUNNING');
            const files = [...new Set(codeKids.map((c) => c.meta?.file).filter(Boolean))];
            const batch = {
              id: `code-batch-${p.id}`, type: 'code', name: '代码改动',
              status: failed ? 'FAILED' : running ? 'RUNNING' : 'SUCCESS',
              start_time: Math.min(...codeKids.map((c) => c.start_time ?? 0)),
              end_time: Math.max(...codeKids.map((c) => c.end_time ?? 0)),
              duration_ms: codeKids.reduce((a, c) => a + (c.duration_ms ?? 0), 0),
              event_ids: codeKids.flatMap((c) => c.event_ids ?? []),
              session_id: full.session_id, task_id: full.task_id, parent_id: p.id,
              meta: { batch: codeKids.map((c) => c.id), count: codeKids.length, files: files.length, file_list: files },
            };
            kids = kids.filter((x) => x.type !== 'code');
            kids.push(batch);
          }
          kids.sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0));
          keyNodesByPhase.set(p.id, kids);
          nodes.push(...kids);
        }

        const edges = [];
        let k = 0;
        const addE = (source, target, type, meta) => {
          k += 1;
          edges.push({ id: `ke${k}`, source, target, type, ...(meta ? { meta } : {}) });
        };
        if (task && phases.length) {
          addE(task.id, phases[0].id, 'depends_on');
          for (const ph of phases) addE(task.id, ph.id, 'contains');
        }
        for (let i = 0; i + 1 < phases.length; i += 1) addE(phases[i].id, phases[i + 1].id, 'depends_on');
        for (const ph of phases) {
          const kids = keyNodesByPhase.get(ph.id) ?? [];
          for (const kid of kids) addE(ph.id, kid.id, 'contains');
          if (!kids.length) continue;
          addE(ph.id, kids[0].id, 'depends_on');
          for (let i = 0; i + 1 < kids.length; i += 1) addE(kids[i].id, kids[i + 1].id, 'depends_on');
        }
        const ids = new Set(nodes.map((n) => n.id));
        for (const e of full.edges) {
          if (e.type === 'retries' && e.source === e.target && ids.has(e.source)) edges.push({ ...e });
        }

        const kg = {
          task_id: full.task_id, session_id: full.session_id, title: full.title,
          status: full.status, start_time: full.start_time, end_time: full.end_time,
          duration_ms: full.duration_ms, meta: full.meta, summary: full.summary,
          critical_path: full.critical_path, nodes, edges,
        };
        this._keyCache = { src: this.graph, kg };
        return kg;
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
        this._keyCache = null;
        this.keyBtn.toggleAttribute('data-on', this.keyView);
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
        // Keep the graph readable on big sessions: collapse turns so the
        // first paint stays navigable (spec §12). The most recent turn stays
        // expanded (that is the activity the user cares about); every step
        // keeps its own collapse affordance for manual drill-down.
        // Key view is already sparse — never auto-collapse it.
        if (!this.graph || this.keyView) return;
        const phases = this.graph.nodes.filter((n) => n.type === 'phase');
        const sorted = [...phases].sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0));
        if (this.graph.nodes.length > 200 && sorted.length > 1) {
          for (const p of sorted.slice(0, -1)) this.collapsed.add(p.id);
        } else if (sorted.length > 14) {
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
        const g = this.keyView ? this._deriveKeyGraph() : this.graph;
        this.viewGraph = g;
        this.activeIndex = buildIndex(g);
        const vis = computeVisibility(g, this.activeIndex, this.hiddenTypes, this.collapsed);
        let layout;
        if (this.layoutMode === 'timeline') layout = layoutTimeline(g, vis);
        else if (this.layoutMode === 'force') layout = layoutForce(g, vis);
        else layout = layoutDAG(g, vis, this.dagDir);

        const searchHits = this._searchHits(vis);
        let cp = null;
        if (this.cpOn) {
          if (this.keyView) {
            // project the full-graph critical path onto key nodes: every
            // phase carrying a hot node lights up
            const hotPhases = new Set();
            const fullById = this.index?.byId ?? new Map();
            for (const id of this.graph.critical_path?.hot_node_ids ?? []) {
              let cur = fullById.get(id);
              while (cur && cur.type !== 'phase') cur = fullById.get(cur.parent_id);
              if (cur) hotPhases.add(cur.id);
            }
            cp = { node_ids: [...hotPhases], edge_ids: [] };
          } else {
            cp = this.graph.critical_path;
          }
        }
        this.renderer.render(g, vis, layout, {
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

      /** Batched key node (e.g. 代码改动 ×N): list its members, drill per member. */
      _renderBatchMembers(body, batch) {
        const full = this.graph;
        const byId = this.index?.byId ?? new Map();
        const members = (batch.meta.batch ?? []).map((id) => byId.get(id)).filter(Boolean);
        if (!members.length) return;
        body.appendChild(el('div', { class: 'tg-sec' }, [`包含 ${members.length} 处改动`]));
        const wrap = el('div', { class: 'tg-act' });
        for (const m of members) {
          const row = el('div', { class: 'tg-act-tool', 'data-status': m.status }, [
            el('span', { class: 'tg-act-name' }, [m.meta?.tool_name ?? m.name]),
            el('span', { class: 'tg-act-args' }, [m.meta?.file ?? '']),
            el('span', { class: 'tg-act-dur' }, [`${m.status === 'FAILED' ? '✗' : '✓'} ${fmtDuration(m.duration_ms)}`]),
          ]);
          row.addEventListener('click', () => this.selectNode(m.id));
          wrap.appendChild(row);
        }
        body.appendChild(wrap);
      }

      /**
       * "What actually happened" — the full step/tool activity of a turn.
       * The canvas shows key nodes only; this list in the detail panel is
       * where the specifics live. Tool rows drill into their own detail.
       */
      _renderPhaseActivity(body, phase) {
        const full = this.graph;
        if (!full) return;
        const steps = full.nodes
          .filter((x) => x.type === 'agent' && x.parent_id === phase.id)
          .sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0));
        if (!steps.length) return;
        const toolsOf = new Map();
        for (const t of full.nodes) {
          if (!t.parent_id || t.type === 'agent') continue;
          if (!toolsOf.has(t.parent_id)) toolsOf.set(t.parent_id, []);
          toolsOf.get(t.parent_id).push(t);
        }
        body.appendChild(el('div', { class: 'tg-sec' }, [`执行明细 · ${steps.length} steps`]));
        const wrap = el('div', { class: 'tg-act' });
        for (const st of steps) {
          const tk = st.meta?.tokens;
          const bits = [st.name];
          if (st.meta?.model) bits.push(truncate(st.meta.model, 16));
          bits.push(fmtDuration(st.duration_ms));
          if (tk?.input || tk?.output) bits.push(`${fmtNum(tk.input)}→${fmtNum(tk.output)}`);
          if ((st.meta?.attempts?.length ?? 0) > 0) bits.push(`↻${st.meta.attempts.length}`);
          wrap.appendChild(el('div', { class: 'tg-act-step' }, [bits.join(' · ')]));
          const tools = (toolsOf.get(st.id) ?? []).sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0));
          for (const t of tools) {
            const args = t.meta?.arguments;
            const argTxt = typeof args === 'string'
              ? truncate(args, 90)
              : truncate(args?.command ?? args?.file_path ?? args?.path ?? args?.pattern ?? args?.name ?? args?.description ?? JSON.stringify(args ?? ''), 90);
            const att = (t.meta?.attempts?.length ?? 0) > 1 ? ` · ↻${t.meta.attempts.length}` : '';
            const row = el('div', { class: 'tg-act-tool', 'data-status': t.status }, [
              el('span', { class: 'tg-act-name' }, [t.meta?.tool_name ?? t.name]),
              el('span', { class: 'tg-act-args' }, [argTxt]),
              el('span', { class: 'tg-act-dur' }, [`${t.status === 'FAILED' ? '✗' : '✓'} ${fmtDuration(t.duration_ms)}${att}`]),
            ]);
            row.addEventListener('click', () => this.selectNode(t.id));
            wrap.appendChild(row);
          }
        }
        body.appendChild(wrap);
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
          for (const e of this.viewGraph?.edges ?? []) {
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
        // full-graph nodes first; key-derived nodes (e.g. batched edits)
        // live only in the active index
        const n = this.index?.byId.get(id) ?? this.activeIndex?.byId.get(id);
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
        if (n.meta?.batch) this._renderBatchMembers(body, n);
        if (n.type === 'phase') this._renderPhaseActivity(body, n);

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
          style: 'position:absolute;z-index:80;left:50%;top:60px;transform:translateX(-50%);max-width:560px;width:90%;background:var(--tg-panel);backdrop-filter:var(--tg-glass-blur);-webkit-backdrop-filter:var(--tg-glass-blur);border:1px solid var(--tg-border2);border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.5);display:flex;flex-direction:column;max-height:70%',
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
        else if (!this.current && this.tasks.length > 0) await this.loadTask(pickDefaultTask(this.tasks).ref);
        // re-opening a previously loaded running task: resume the live stream
        if (this.current?.live && !this.liveSource && this.graph?.task_id) {
          this._startLive(this.current.ref);
        }
        this.render(true);
      }
      close() {
        this.opened = false;
        this._stopLive();
        this.renderer?._stopLiveTicker();
      }
      dispose() {
        this._stopLive();
        this.renderer?._stopLiveTicker();
        this.root.remove();
      }
    }

    /* ================================================================ *
     * Mounting — the graph is a third tab (图谱) inside DSH's native    *
     * 对话/轨迹 tab bar; its view occupies only the tab content area.   *
     * Shells without a tablist fall back to a floating button.         *
     * ================================================================ */
    const TAB_ATTR = 'data-dsh-taskgraph-tab';
    const VIEW_ATTR = 'data-dsh-taskgraph-view';
    const ICON = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="3" cy="8" r="2"/><circle cx="12" cy="3.5" r="2"/><circle cx="12" cy="12.5" r="2"/><path d="M5 7.4 10 4M5 8.6 10 12"/></svg>';

    let app = null;
    let myTab = null;
    let view = null;
    let paneRoot = null;
    let prevNativeTab = null; // native tab that was active before we took over
    let nativeActiveClass = null; // captured ONCE from the native tabs (React-managed)
    let nativeBaseClass = null;

    const isActive = () => document.documentElement.hasAttribute('data-dsh-taskgraph-active');
    function setActive(active) {
      document.documentElement.toggleAttribute('data-dsh-taskgraph-active', active);
    }

    const findTablist = () => document.querySelector('[role="tablist"]');

    /** Walk up from the tablist to the pane container (flex-column ancestor). */
    function paneRootOf(tablist) {
      let el = tablist.parentElement;
      while (el && el !== document.body) {
        const cs = getComputedStyle(el);
        if (cs.display === 'flex' && cs.flexDirection === 'column') return el;
        el = el.parentElement;
      }
      return null;
    }

    /** Direct child of `root` that contains `inner` (marked keep-visible). */
    function directChildOf(root, inner) {
      let el = inner;
      while (el && el.parentElement !== root) el = el.parentElement;
      return el;
    }

    /**
     * Mark opaque native panes (e.g. the 轨迹 view container) with
     * data-tg-glass so the shared CSS gives them the same see-through look as
     * the 对话 pane. Transparent children (conversation scroll body) are
     * skipped automatically.
     */
    function glassifyNativePanes(tablist) {
      if (isActive()) return; // native panes are hidden while the graph is up
      const root = paneRootOf(tablist);
      if (!root) return;
      const walk = (el, depth) => {
        if (depth > 6) return;
        for (const child of el.children) {
          if (child === view || view?.contains(child)) continue;
          if (child.hasAttribute('data-dsh-taskgraph-keep')) continue;
          if (child.hasAttribute('data-tg-glass')) continue;
          const cs = getComputedStyle(child);
          if (cs.display === 'none') continue;
          const bg = cs.backgroundColor;
          const opaque = bg.startsWith('rgb(')
            || (bg.startsWith('rgba(') && Number.parseFloat(bg.split(',')[3]) > 0.6);
          if (opaque && child.offsetWidth > 200 && child.offsetHeight > 120) {
            child.setAttribute('data-tg-glass', '');
            continue; // container handled; no need to descend
          }
          walk(child, depth + 1);
        }
      };
      walk(root, 0);
    }

    function nativeTabs(tablist) {
      return [...tablist.querySelectorAll('button')].filter((b) => b !== myTab);
    }

    /**
     * Native tab styling is CSS-modules + React managed. We capture the
     * "active" marker class exactly once (before ever touching the DOM) and
     * thereafter only apply/remove it — never recompute from mutated state.
     */
    function captureNativeClasses(tablist) {
      if (nativeActiveClass && nativeBaseClass) return;
      const tabs = nativeTabs(tablist);
      const active = tabs.find((t) => t.getAttribute('aria-selected') === 'true') ?? tabs[0];
      const inactive = tabs.find((t) => t !== active);
      if (active && inactive) {
        const a = new Set(active.className.trim().split(/\s+/).filter(Boolean));
        const b = new Set(inactive.className.trim().split(/\s+/).filter(Boolean));
        nativeActiveClass ??= [...a].find((c) => !b.has(c)) ?? null;
        nativeBaseClass ??= [...b].join(' ');
      } else if (active) {
        nativeActiveClass ??= [...active.classList].find((c) => /active/i.test(c)) ?? null;
        nativeBaseClass ??= [...active.classList].filter((c) => c !== nativeActiveClass).join(' ');
      }
      if (myTab && nativeBaseClass && !myTab.dataset.tgStyled) {
        myTab.className = nativeBaseClass;
        myTab.dataset.tgStyled = '1';
      }
    }

    function syncTabStyles() {
      const tablist = findTablist();
      if (!tablist || !myTab || !myTab.isConnected) return;
      captureNativeClasses(tablist);
      const active = isActive();
      for (const t of nativeTabs(tablist)) {
        if (active) {
          // remember who was selected so we can restore on exit
          if (t.getAttribute('aria-selected') === 'true' && !prevNativeTab) prevNativeTab = t;
          if (nativeActiveClass) t.classList.remove(nativeActiveClass);
          t.setAttribute('aria-selected', 'false');
        }
      }
      if (!active && prevNativeTab && prevNativeTab.isConnected) {
        if (nativeActiveClass) prevNativeTab.classList.add(nativeActiveClass);
        prevNativeTab.setAttribute('aria-selected', 'true');
        prevNativeTab = null;
      }
      if (nativeActiveClass) myTab.classList.toggle(nativeActiveClass, active);
      myTab.setAttribute('aria-selected', active ? 'true' : 'false');
    }

    function ensureView() {
      view = document.querySelector(`[${VIEW_ATTR}]`) ?? view;
      if (!view || !view.isConnected) {
        view = document.createElement('div');
        view.setAttribute(VIEW_ATTR, '');
      }
      return view;
    }

    function activate(initialRef) {
      const tablist = findTablist();
      if (!tablist) { toggleStandalone(initialRef); return; }
      if (isActive()) { deactivate(); return; }

      paneRoot = paneRootOf(tablist);
      const v = ensureView();
      v.classList.remove('tg-standalone');
      if (paneRoot) {
        paneRoot.setAttribute('data-dsh-taskgraph-pane', '');
        const headerEl = tablist.closest('header') ?? tablist;
        const keep = directChildOf(paneRoot, headerEl);
        if (keep) keep.setAttribute('data-dsh-taskgraph-keep', '');
        paneRoot.appendChild(v); // in-flow: under the header, fills the rest
      } else {
        // unexpected layout — degrade to overlay instead of breaking
        const host = document.querySelector('[class*="centerCol"]') ?? document.body;
        v.classList.add('tg-standalone');
        host.appendChild(v);
      }

      if (!app || app.root !== v) {
        app?.dispose();
        app = new App(v);
      }
      setActive(true);
      syncTabStyles();
      app.open(initialRef);
    }

    function deactivate() {
      if (!isActive()) return;
      setActive(false);
      app?.close();
      syncTabStyles(); // restores the native tab's active look
    }

    /** Toggle used by the fallback floating button / standalone demo. */
    function toggleStandalone(initialRef) {
      injectCss();
      if (isActive()) { deactivate(); return; }
      const v = ensureView();
      v.classList.add('tg-standalone');
      if (!v.isConnected) document.body.appendChild(v);
      if (!app || app.root !== v) {
        app?.dispose();
        app = new App(v);
      }
      setActive(true);
      app.open(initialRef);
    }

    function createTabButton() {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.setAttribute(TAB_ATTR, '');
      btn.setAttribute('aria-selected', 'false');
      btn.setAttribute('title', '任务执行图谱 (Task Flow Graph)');
      btn.textContent = '图谱';
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        activate();
      });
      return btn;
    }

    /* ---- self-healing mount ------------------------------------------ *
     * React re-renders can remove our injected tab/view; a body-level     *
     * MutationObserver re-places them and keeps tab styling consistent.   */
    function mountTabEntry() {
      myTab = createTabButton();
      const startedAt = Date.now();
      let standaloneFallback = false;
      let scheduled = false;

      const reconcile = () => {
        scheduled = false;
        const tablist = findTablist();
        if (tablist) {
          if (!tablist.contains(myTab)) tablist.appendChild(myTab);
          if (isActive()) {
            // pane may have re-rendered: re-anchor view + marks
            const root = paneRootOf(tablist);
            if (root && root !== paneRoot) {
              paneRoot = root;
              paneRoot.setAttribute('data-dsh-taskgraph-pane', '');
              const keep = directChildOf(paneRoot, tablist.closest('header') ?? tablist);
              if (keep) keep.setAttribute('data-dsh-taskgraph-keep', '');
            }
            if (view && paneRoot && !paneRoot.contains(view)) paneRoot.appendChild(view);
          }
          syncTabStyles();
          glassifyNativePanes(tablist);
        } else if (!standaloneFallback && Date.now() - startedAt > 3000) {
          // shell without a tab bar: float the entry instead
          standaloneFallback = true;
          mountFloatingEntry();
        }
      };
      const schedule = () => {
        if (!scheduled) {
          scheduled = true;
          requestAnimationFrame(reconcile);
        }
      };
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true });

      // native tab clicked → leave the graph view, hand back to DSH
      document.addEventListener('click', (ev) => {
        if (!isActive()) return;
        const tablist = findTablist();
        if (!tablist) return;
        const btn = ev.target instanceof Element ? ev.target.closest('button') : null;
        if (btn && btn !== myTab && tablist.contains(btn)) deactivate();
      }, true);
      document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && isActive()) deactivate();
      });

      reconcile();
    }

    function mountFloatingEntry() {
      if (document.querySelector('[data-dsh-taskgraph-fab]')) return;
      const fab = document.createElement('button');
      fab.setAttribute('data-dsh-taskgraph-fab', '');
      fab.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:120;display:flex;align-items:center;gap:8px;'
        + 'padding:9px 14px;border-radius:10px;border:1px solid var(--tg-border2,#3d444d);'
        + 'background:var(--tg-bg2,#151b23);color:var(--tg-text,#e6edf3);cursor:pointer;font-size:13px;font-family:inherit;'
        + 'box-shadow:0 6px 24px rgba(0,0,0,.4)';
      fab.innerHTML = `${ICON}<span>任务执行图谱</span>`;
      fab.addEventListener('click', () => toggleStandalone());
      document.body.appendChild(fab);
    }

    function boot() {
      injectCss();
      if (document.querySelector(`[${VIEW_ATTR}], [${TAB_ATTR}], [data-dsh-taskgraph-fab]`)) return;
      const standalone = typeof window.__ModuleLoader__ === 'undefined';
      if (standalone) {
        // demo page: instant full-screen experience behind a floating toggle
        mountFloatingEntry();
        setTimeout(() => toggleStandalone(), 60);
      } else {
        mountTabEntry();
      }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    return { activate, deactivate, toggleStandalone, App };
  }

  // DSH client-module contract: the boot pipeline applies every client module
  // as a cordis plugin, so the factory must return `{apply, inject}` (see
  // dsh-desktop-app-layout). `boot()` is idempotent (mount guard), therefore
  // running it in the factory body AND from `apply` is safe and covers both
  // "materialized at load" and "applied at plugin boot" timings.
  if (typeof window !== 'undefined' && window.__ModuleLoader__ && typeof window.__ModuleLoader__.load === 'function') {
    window.__ModuleLoader__.load({
      id: 'dsh-task-graph',
      immediately: true,
      factory: () => {
        const module = { exports: {} };
        function apply() {
          if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => bootSafe());
          else bootSafe();
        }
        let api = null;
        function bootSafe() {
          try {
            api ??= factory();
          } catch (error) {
            console.error('[dsh-task-graph] boot failed:', error);
          }
        }
        bootSafe(); // CSS/mount as early as possible; self-heals until the shell renders
        module.exports.apply = apply;
        module.exports.inject = [];
        module.exports.immediately = true;
        module.exports.activate = (...args) => api?.activate(...args);
        module.exports.deactivate = () => api?.deactivate();
        return module.exports;
      },
    });
  } else if (typeof window !== 'undefined') {
    // standalone demo page (no DSH module loader): boot as a plain script
    factory();
  }
})();




