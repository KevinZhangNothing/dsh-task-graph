/**
 * dsh-task-graph core: turns a DSH session trajectory (JSONL events) into the
 * Task Flow Graph model defined in docs/data-model.md.
 *
 * Pure module — no Node/browser-specific APIs — shared by the DSH server
 * routes, the standalone demo, and the unit tests.
 *
 * Event vocabulary handled (see docs/trajectory-events.md):
 *   session, session/title, turn/start, turn/end, step/start, step/end,
 *   request/header, request/context, assistant/chunk (usage/finish blocks),
 *   tool/call, tool/result, llm/retry, llm/retry-started, todo/write,
 *   user/message, assistant/message, subagent/descriptor, approval/policy …
 *
 * @module dsh-task-graph/graph
 */

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export const STATUS = Object.freeze({
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
  CANCELLED: 'CANCELLED',
  RETRYING: 'RETRYING',
});

export const NODE_TYPE = Object.freeze({
  TASK: 'task',
  PHASE: 'phase', // one conversation turn; grouping layer above agents
  AGENT: 'agent', // one LLM step (request → response cycle)
  TOOL: 'tool',
  SKILL: 'skill',
  SUBAGENT: 'subagent',
  PLAN: 'plan', // todo_write
  CODE: 'code', // file edits/writes
  TEST: 'test', // test-looking bash commands
});

export const EDGE_TYPE = Object.freeze({
  CONTAINS: 'contains',
  DEPENDS_ON: 'depends_on',
  CALLS: 'calls',
  INVOKES: 'invokes',
  DELEGATES: 'delegates',
  PRODUCES: 'produces',
  CONSUMES: 'consumes',
  MODIFIES: 'modifies',
  VALIDATES: 'validates',
  RETRIES: 'retries',
  RECOVERS_FROM: 'recovers_from',
});

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function trunc(text, max = 400) {
  if (typeof text !== 'string') return text;
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function safeParse(raw) {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function firstText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  for (const block of content) {
    if (block && typeof block === 'object') {
      if (block.type === 'text' && typeof block.text === 'string') return block.text;
      if (Array.isArray(block.content)) {
        const inner = firstText(block.content);
        if (inner !== '') return inner;
      }
    }
  }
  return '';
}

function stableHash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Heuristic classification of a raw tool call into a graph node type. */
export function classifyTool(name, args) {
  const n = String(name ?? '').toLowerCase();
  if (n === 'skill') return NODE_TYPE.SKILL;
  if (n === 'subagent' || n === 'agent' || n === 'spawn_agent') return NODE_TYPE.SUBAGENT;
  if (n === 'todo_write' || n === 'todo/write') return NODE_TYPE.PLAN;
  if (n === 'edit' || n === 'write' || n === 'str_replace_editor' || n === 'apply_patch') return NODE_TYPE.CODE;
  if (n === 'bash' || n === 'shell' || n === 'pwsh') {
    const command = typeof args === 'string' ? args : (args && (args.command ?? args.cmd)) || '';
    if (/(^|\s|;|&&|\|)(pytest|jest|vitest|cargo test|go test|flutter test|dart test|pnpm test|npm (run )?test|yarn test|make test|swift test)(\s|$)/.test(String(command))) {
      return NODE_TYPE.TEST;
    }
  }
  return NODE_TYPE.TOOL;
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

/**
 * Build a Task Flow Graph from a parsed DSH trajectory.
 *
 * @param {Array<object>} events - trajectory events ordered by seq/time.
 *   The leading `session` header event is optional; a `header` option may be
 *   supplied instead.
 * @param {object} [options]
 * @param {object} [options.header] - session header ({id, createdAt, cwd, …})
 *   when not present as the first event.
 * @param {Array<object>} [options.children] - child (subagent) session
 *   summaries: {id, ref, title, createdAt, endTime, status, counts}.
 * @param {boolean} [options.live] - treat unclosed steps/tools as RUNNING.
 * @param {string} [options.workspace] - workspace slug for display/links.
 * @returns {{task_id:string,nodes:Array,edges:Array,summary:object,meta:object}}
 */
export function buildGraph(events, options = {}) {
  const header = options.header ?? (events[0]?.type === 'session' ? events[0] : { id: 'task', createdAt: events[0]?.time ?? Date.now() });
  const sessionId = header.id ?? 'task';
  const taskId = sessionId;
  const live = options.live === true;
  const workspace = options.workspace ?? '';

  /** @type {Map<string, object>} */
  const nodes = new Map();
  /** @type {Array<object>} */
  const edges = [];
  const edgeKeys = new Set();

  function addNode(node) {
    nodes.set(node.id, node);
    return node;
  }

  function addEdge(source, target, type, meta) {
    const key = `${source}\u0000${target}\u0000${type}`;
    if (source === target && type !== EDGE_TYPE.RETRIES) return null;
    if (edgeKeys.has(key)) return null;
    edgeKeys.add(key);
    const edge = { id: `e${edges.length + 1}`, source, target, type };
    if (meta !== undefined) edge.meta = meta;
    edges.push(edge);
    return edge;
  }

  /* ---- root task node ---- */
  const taskNode = addNode({
    id: 'task',
    type: NODE_TYPE.TASK,
    name: sessionId,
    status: STATUS.RUNNING,
    start_time: header.createdAt ?? null,
    end_time: null,
    duration_ms: null,
    event_ids: header.type === 'session' && events[0] ? [events[0].seq].filter((s) => s !== undefined) : [],
    session_id: sessionId,
    task_id: taskId,
    parent_id: null,
    meta: {
      cwd: header.cwd ?? null,
      delegation_depth: header.delegationDepth ?? 0,
      workspace,
      title: null,
      user_request: null,
    },
  });

  /* ---- incremental state ---- */
  let title = null;
  let titleSeq = null;
  let currentPhase = null;
  let currentStep = null;
  let lastStepNode = null; // last closed step, for cross-turn chaining
  let phaseCount = 0;
  let userMessageForNextPhase = null;
  const openTools = new Map(); // callId → tool node
  const toolGroups = new Map(); // turn|name|argsHash → tool node (retry grouping)
  let planNode = null;
  const tokenTotals = { input: 0, output: 0, cache_read: 0 };
  let lastEventTime = header.createdAt ?? null;
  let finalTurnReason = null;
  const toolNameCounts = new Map();

  const children = [...(options.children ?? [])].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const childUsed = new Set();
  const sequencedPhases = new Set();

  function phaseForTurn(turn, time) {
    if (currentPhase && currentPhase.meta.turn === turn) return currentPhase;
    phaseCount += 1;
    const id = `phase-${turn ?? phaseCount}`;
    const phase = addNode({
      id,
      type: NODE_TYPE.PHASE,
      name: `Turn ${turn ?? phaseCount}`,
      status: STATUS.RUNNING,
      start_time: time,
      end_time: null,
      duration_ms: null,
      event_ids: [],
      session_id: sessionId,
      task_id: taskId,
      parent_id: 'task',
      meta: { turn, user_message: null, reason: null },
    });
    addEdge('task', id, EDGE_TYPE.CONTAINS);
    if (phaseCount === 1) addEdge('task', id, EDGE_TYPE.DEPENDS_ON);
    // chain phases sequentially so the DAG reads top-down
    const previous = currentPhase ?? lastStepNode;
    if (previous && previous.id !== 'task') addEdge(previous.id, id, EDGE_TYPE.DEPENDS_ON);
    currentPhase = phase;
    return phase;
  }

  function attachPendingUserMessage(phase) {
    if (userMessageForNextPhase) {
      phase.meta.user_message = userMessageForNextPhase.text;
      phase.event_ids.push(userMessageForNextPhase.seq);
      if (phase.meta.user_message) {
        phase.name = trunc(phase.meta.user_message.replace(/\s+/g, ' ').trim(), 48) || phase.name;
      }
      userMessageForNextPhase = null;
    }
  }

  function closeStep(step, status) {
    if (step.status === STATUS.SUCCESS || step.status === STATUS.FAILED || step.status === STATUS.CANCELLED) return;
    step.status = status;
    step.end_time = step.end_time ?? lastEventTime;
    step.duration_ms = step.start_time != null && step.end_time != null ? Math.max(0, step.end_time - step.start_time) : null;
  }

  function aggregatePhaseStatus(phase) {
    // A phase only counts as FAILED when its latest outcome is a failure:
    // errors that were later worked around (retried tool, next step
    // succeeded) are "recovered" and keep the phase green while staying
    // visible on the failed node itself (spec §15 error localization).
    let lastFailure = -Infinity;
    let lastSuccess = -Infinity;
    let running = false;
    let retrying = false;
    for (const node of nodes.values()) {
      if (node.parent_id !== phase.id) continue;
      const t = node.end_time ?? node.start_time ?? 0;
      if (node.status === STATUS.FAILED) lastFailure = Math.max(lastFailure, t);
      else if (node.status === STATUS.SUCCESS) lastSuccess = Math.max(lastSuccess, t);
      else if (node.status === STATUS.RUNNING) running = true;
      else if (node.status === STATUS.RETRYING) retrying = true;
    }
    const failed = lastFailure > lastSuccess;
    phase.status = failed ? STATUS.FAILED : running ? STATUS.RUNNING : retrying ? STATUS.RETRYING : STATUS.SUCCESS;
    if (!running) {
      phase.end_time = lastEventTime;
      phase.duration_ms = phase.start_time != null ? Math.max(0, phase.end_time - phase.start_time) : null;
    }
  }

  function matchChildSession(toolNode) {
    const start = toolNode.start_time ?? 0;
    const end = toolNode.end_time ?? Infinity;
    for (const child of children) {
      if (childUsed.has(child.id)) continue;
      const createdAt = child.createdAt ?? 0;
      if (createdAt >= start - 5000 && createdAt <= end + 5000) {
        childUsed.add(child.id);
        return child;
      }
    }
    return null;
  }

  /* ---- event stream ---- */
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const { type } = event;
    if (type === 'session') continue;
    const seq = event.seq;
    const time = event.time ?? lastEventTime;
    if (typeof time === 'number') lastEventTime = time;
    const data = event.data ?? {};

    switch (type) {
      case 'session/title': {
        title = data.title ?? title;
        titleSeq = seq;
        taskNode.event_ids.push(seq);
        break;
      }

      case 'turn/start': {
        if (currentStep) closeStep(currentStep, STATUS.SUCCESS);
        if (currentPhase) aggregatePhaseStatus(currentPhase);
        currentStep = null;
        const phase = phaseForTurn(data.turn, time);
        phase.event_ids.push(seq);
        attachPendingUserMessage(phase);
        break;
      }

      case 'turn/end': {
        if (currentStep) closeStep(currentStep, STATUS.SUCCESS);
        finalTurnReason = data.reason ?? null;
        if (currentPhase) {
          currentPhase.meta.reason = finalTurnReason;
          currentPhase.event_ids.push(seq);
          aggregatePhaseStatus(currentPhase);
          if (currentPhase.status !== STATUS.FAILED) {
            const kind = finalTurnReason?.kind;
            currentPhase.status = kind === 'completed' ? STATUS.SUCCESS
              : kind === 'aborted' ? STATUS.CANCELLED
                : kind === 'error' ? STATUS.FAILED
                  : currentPhase.status;
          }
          lastStepNode = currentPhase;
        }
        currentPhase = null;
        currentStep = null;
        break;
      }

      case 'step/start': {
        const phase = currentPhase ?? phaseForTurn(data.turn, time);
        if (currentStep) closeStep(currentStep, STATUS.SUCCESS);
        const id = `step-${data.turn}-${data.step}`;
        const step = addNode({
          id,
          type: NODE_TYPE.AGENT,
          name: `LLM ${data.turn}.${data.step}`,
          status: STATUS.RUNNING,
          start_time: time,
          end_time: null,
          duration_ms: null,
          event_ids: seq !== undefined ? [seq] : [],
          session_id: sessionId,
          task_id: taskId,
          parent_id: phase.id,
          meta: {
            turn: data.turn,
            step: data.step,
            provider: null,
            model: null,
            finish_reason: null,
            tokens: { input: 0, output: 0, cache_read: 0 },
            attempts: [],
            tool_call_count: 0,
          },
        });
        addEdge(phase.id, id, EDGE_TYPE.CONTAINS);
        if (!sequencedPhases.has(phase.id)) {
          // sequencing spine for the critical path: phase → its first step
          sequencedPhases.add(phase.id);
          addEdge(phase.id, id, EDGE_TYPE.DEPENDS_ON);
        }
        const previous = currentStep ?? null;
        if (previous) addEdge(previous.id, id, EDGE_TYPE.DEPENDS_ON);
        currentStep = step;
        break;
      }

      case 'step/end': {
        const step = currentStep && currentStep.meta.step === data.step && currentStep.meta.turn === data.turn
          ? currentStep
          : nodes.get(`step-${data.turn}-${data.step}`);
        if (step) {
          step.event_ids.push(seq);
          if (step.meta.attempts.length > 0 && step.status !== STATUS.FAILED) step.status = STATUS.RETRYING;
          closeStep(step, step.status === STATUS.RETRYING ? STATUS.RETRYING : STATUS.SUCCESS);
          // RETRYING means "it retried but eventually succeeded" once closed
          if (step.status === STATUS.RETRYING && step.end_time != null) step.status = STATUS.SUCCESS;
          if (step.meta.attempts.length > 0) step.meta.retried = true;
          lastStepNode = step;
        }
        if (currentStep && currentStep.id === `step-${data.turn}-${data.step}`) currentStep = null;
        break;
      }

      case 'request/header': {
        if (currentStep) {
          const config = data.header?.config ?? {};
          currentStep.meta.provider = config.provider ?? data.header?.provider ?? currentStep.meta.provider;
          currentStep.meta.model = config.model ?? data.header?.model ?? currentStep.meta.model;
          currentStep.event_ids.push(seq);
        }
        break;
      }

      case 'request/context': {
        if (currentStep) {
          currentStep.meta.provider = data.provider ?? currentStep.meta.provider;
          currentStep.meta.model = data.model ?? currentStep.meta.model;
        }
        break;
      }

      case 'llm/retry': {
        const step = currentStep ?? nodes.get(`step-${data.turn}-${data.step}`);
        if (step) {
          step.meta.attempts.push({
            retry: data.retry,
            max_retries: data.maxRetries,
            delay_ms: data.delayMs ?? null,
            failure: data.failure ?? null,
            time,
          });
          step.event_ids.push(seq);
          step.status = STATUS.RETRYING;
        }
        break;
      }

      case 'llm/retry-started': {
        const step = currentStep ?? nodes.get(`step-${data.turn}-${data.step}`);
        if (step) step.event_ids.push(seq);
        break;
      }

      case 'assistant/chunk': {
        const chunk = data.chunk ?? {};
        if (chunk.type === 'usage' && chunk.usage && currentStep) {
          const u = chunk.usage;
          currentStep.meta.tokens.input += u.inputTokens ?? 0;
          currentStep.meta.tokens.output += u.outputTokens ?? 0;
          currentStep.meta.tokens.cache_read += u.cacheReadTokens ?? 0;
          tokenTotals.input += u.inputTokens ?? 0;
          tokenTotals.output += u.outputTokens ?? 0;
          tokenTotals.cache_read += u.cacheReadTokens ?? 0;
        } else if (chunk.type === 'finish' && currentStep) {
          currentStep.meta.finish_reason = chunk.reason?.kind ?? null;
        }
        break;
      }

      case 'user/message': {
        if (seq !== undefined && titleSeq === null && title === null) {
          // first user message doubles as the task title when no title exists
          const text = firstText(data.content);
          if (text) taskNode.meta.user_request = trunc(text.replace(/\s+/g, ' ').trim(), 200);
        }
        // stash for the phase that follows (messages arrive before turn/start)
        const text = firstText(data.content);
        if (text) userMessageForNextPhase = { seq, text: trunc(text.replace(/\s+/g, ' ').trim(), 200) };
        break;
      }

      case 'agent/inbox/spliced': {
        const inserted = Array.isArray(data.inserted) ? data.inserted : [];
        for (const message of inserted) {
          if (message?.role === 'user') {
            const text = firstText(message.content);
            if (text) userMessageForNextPhase = { seq, text: trunc(text.replace(/\s+/g, ' ').trim(), 200) };
          }
        }
        break;
      }

      case 'todo/write': {
        const owner = currentPhase ?? taskNode;
        if (!planNode || planNode.parent_id !== owner.id) {
          planNode = addNode({
            id: `plan-${owner.id}-${nodes.size}`,
            type: NODE_TYPE.PLAN,
            name: 'Plan',
            status: STATUS.SUCCESS,
            start_time: time,
            end_time: time,
            duration_ms: 0,
            event_ids: [],
            session_id: sessionId,
            task_id: taskId,
            parent_id: owner.id,
            meta: { todos: [] },
          });
          addEdge(owner.id, planNode.id, EDGE_TYPE.CONTAINS);
          if (currentStep) addEdge(currentStep.id, planNode.id, EDGE_TYPE.PRODUCES);
        }
        planNode.meta.todos = (data.todos ?? []).map((t) => ({ content: trunc(String(t.content ?? ''), 160), status: t.status ?? 'pending' }));
        planNode.event_ids.push(seq);
        planNode.end_time = time;
        break;
      }

      case 'tool/call': {
        const step = currentStep ?? nodes.get(`step-${data.turn}-${data.step}`) ?? taskNode;
        const args = safeParse(data.arguments);
        const toolType = classifyTool(data.name, args);
        // Retry grouping: an identical call right after a FAILED one is the
        // next attempt of the same logical tool node (no node duplication).
        // The key ignores turn/step: fix→test loops legitimately cross turns.
        const argsKey = typeof data.arguments === 'string' ? data.arguments : JSON.stringify(args);
        const groupKey = `${data.name}|${stableHash(argsKey)}`;

        // Retry grouping: an identical call right after a FAILED one is the
        // next attempt of the same logical tool node (no node duplication).
        const previousAttempt = toolGroups.get(groupKey);
        if (previousAttempt && previousAttempt.status === STATUS.FAILED) {
          previousAttempt.meta.attempts.push({
            attempt: previousAttempt.meta.attempts.length + 1,
            call_id: data.callId,
            status: STATUS.RUNNING,
            start_time: time,
            end_time: null,
            error: null,
            event_ids: seq !== undefined ? [seq] : [],
          });
          previousAttempt.status = STATUS.RETRYING;
          previousAttempt.start_time = Math.min(previousAttempt.start_time ?? time, time);
          previousAttempt.end_time = null;
          openTools.set(data.callId, previousAttempt);
          break;
        }

        const id = `tool-${data.callId ?? `n${nodes.size}`}`;
        const displayName = toolType === NODE_TYPE.SKILL
          ? `skill:${args?.name ?? '?'}`
          : toolType === NODE_TYPE.SUBAGENT
            ? trunc(String(args?.description ?? args?.label ?? 'subagent'), 40)
            : String(data.name ?? 'tool');

        const tool = addNode({
          id,
          type: toolType,
          name: displayName,
          status: STATUS.RUNNING,
          start_time: time,
          end_time: null,
          duration_ms: null,
          event_ids: seq !== undefined ? [seq] : [],
          session_id: sessionId,
          task_id: taskId,
          parent_id: step.id,
          meta: {
            tool_name: data.name,
            call_id: data.callId ?? null,
            arguments: args,
            output: null,
            output_preview: null,
            error: null,
            attempts: [{
              attempt: 1,
              call_id: data.callId ?? null,
              status: STATUS.RUNNING,
              start_time: time,
              end_time: null,
              error: null,
              event_ids: seq !== undefined ? [seq] : [],
            }],
            child_session: null,
            file: null,
            command: null,
          },
        });
        if (toolType === NODE_TYPE.CODE) {
          tool.meta.file = args?.file_path ?? args?.path ?? args?.filePath ?? null;
          if (tool.meta.file) tool.name = `${data.name} ${tool.meta.file}`.split('/').slice(-2).join('/');
        }
        if (toolType === NODE_TYPE.TEST) tool.meta.command = trunc(String(args?.command ?? args?.cmd ?? ''), 300);
        if (step.type === NODE_TYPE.AGENT) step.meta.tool_call_count += 1;
        toolNameCounts.set(data.name, (toolNameCounts.get(data.name) ?? 0) + 1);

        addEdge(step.id, id, EDGE_TYPE.CONTAINS);
        const rel = toolType === NODE_TYPE.SKILL ? EDGE_TYPE.INVOKES
          : toolType === NODE_TYPE.SUBAGENT ? EDGE_TYPE.DELEGATES
            : toolType === NODE_TYPE.CODE ? EDGE_TYPE.MODIFIES
              : toolType === NODE_TYPE.TEST ? EDGE_TYPE.VALIDATES
                : EDGE_TYPE.CALLS;
        addEdge(step.id, id, rel);
        openTools.set(data.callId, tool);
        toolGroups.set(groupKey, tool);
        break;
      }

      case 'tool/result': {
        const callId = data.message?.source?.callId
          ?? data.message?.content?.[0]?.toolCallId
          ?? null;
        const tool = openTools.get(callId);
        if (!tool) break;
        openTools.delete(callId);
        const resultBlock = Array.isArray(data.message?.content) ? data.message.content[0] : null;
        const isError = data.error !== undefined || resultBlock?.isError === true;
        const text = trunc(firstText(data.message?.content ?? resultBlock?.content ?? ''), 800);
        const attempt = tool.meta.attempts[tool.meta.attempts.length - 1];

        tool.end_time = time;
        tool.duration_ms = tool.start_time != null ? Math.max(0, time - tool.start_time) : null;
        tool.event_ids.push(seq);
        if (attempt) {
          attempt.status = isError ? STATUS.FAILED : STATUS.SUCCESS;
          attempt.end_time = time;
          attempt.error = isError ? (data.error ?? { message: trunc(text, 200) }) : null;
          if (seq !== undefined) attempt.event_ids.push(seq);
        }
        if (isError) {
          tool.status = STATUS.FAILED;
          tool.meta.error = data.error ?? { name: 'ToolError', message: trunc(text, 300) };
          tool.meta.output_preview = text;
        } else {
          tool.status = tool.meta.attempts.some((a) => a.status === STATUS.FAILED) ? STATUS.RETRYING : STATUS.SUCCESS;
          tool.meta.output = text;
          tool.meta.output_preview = trunc(text, 200);
          if (tool.status === STATUS.RETRYING) {
            // retried and finally succeeded — surface it as success with a badge
            tool.status = STATUS.SUCCESS;
            tool.meta.retried = true;
            tool.meta.error = null; // error reflects final state only
          }
        }
        // duration = sum of attempt spans (attempts may sit far apart in time,
        // so end−start of the whole node would overstate real work)
        tool.duration_ms = tool.meta.attempts.reduce((acc, a) => {
          if (a.start_time != null && a.end_time != null) acc += Math.max(0, a.end_time - a.start_time);
          return acc;
        }, 0);
        // subagent → attach the matching child session summary
        if (tool.type === NODE_TYPE.SUBAGENT) {
          const child = matchChildSession(tool);
          if (child) tool.meta.child_session = child;
        }
        // result feeds the next LLM step: connect to the current step's
        // successor lazily (see step chaining) — handled below via consume map
        tool.meta._result_seq = seq;
        break;
      }

      default:
        break;
    }
  }

  /* ---- result → next-step ("join") edges ----
   * Every tool result is consumed by the following LLM step in the same
   * phase; that yields the fork/join shape for parallel tool calls. */
  const stepsByPhase = new Map();
  for (const node of nodes.values()) {
    if (node.type !== NODE_TYPE.AGENT) continue;
    const list = stepsByPhase.get(node.parent_id) ?? [];
    list.push(node);
    stepsByPhase.set(node.parent_id, list);
  }
  for (const list of stepsByPhase.values()) {
    list.sort((a, b) => (a.meta.turn - b.meta.turn) || (a.meta.step - b.meta.step));
    for (let i = 0; i + 1 < list.length; i += 1) {
      const from = list[i];
      const to = list[i + 1];
      addEdge(from.id, to.id, EDGE_TYPE.DEPENDS_ON);
      for (const node of nodes.values()) {
        if (node.parent_id === from.id && openToolsHas(node) && node.start_time != null) {
          addEdge(node.id, to.id, EDGE_TYPE.CONSUMES, { via: 'result' });
        }
      }
    }
  }
  function openToolsHas(node) {
    return node.type !== NODE_TYPE.PHASE && node.type !== NODE_TYPE.AGENT && node.type !== NODE_TYPE.TASK;
  }

  /* ---- retries self-edges (rendered as small arcs, never node copies) ---- */
  for (const node of nodes.values()) {
    const attempts = node.meta?.attempts;
    const retried = node.type === NODE_TYPE.AGENT
      ? (attempts?.length ?? 0) >= 1
      : (attempts?.length ?? 0) > 1;
    if (retried) {
      node.meta.retried = true;
      addEdge(node.id, node.id, EDGE_TYPE.RETRIES, {
        attempts: attempts?.length ?? 1,
        failures: (attempts ?? []).filter((a) => a.failure || a.status === STATUS.FAILED).length,
      });
    }
  }

  /* ---- unclosed nodes ---- */
  for (const node of nodes.values()) {
    if (node.status === STATUS.RUNNING && !live && node.type !== NODE_TYPE.TASK) {
      // archived session: an unclosed node means the session was cut short
      node.status = node.type === NODE_TYPE.TOOL || node.type === NODE_TYPE.TEST ? STATUS.FAILED : STATUS.CANCELLED;
      node.meta.unclosed = true;
    }
    if (node.duration_ms == null && node.start_time != null && node.end_time != null) {
      node.duration_ms = Math.max(0, node.end_time - node.start_time);
    }
  }

  /* ---- task-level status & timing ---- */
  taskNode.end_time = lastEventTime;
  taskNode.duration_ms = taskNode.start_time != null ? Math.max(0, taskNode.end_time - taskNode.start_time) : null;
  taskNode.meta.title = title ?? taskNode.meta.user_request ?? sessionId;
  if (title === null && taskNode.meta.user_request) taskNode.name = taskNode.meta.user_request;
  else if (title) taskNode.name = trunc(title, 60);
  const anyRunning = [...nodes.values()].some((n) => n.status === STATUS.RUNNING);
  // recovery-aware task status: only fail when the latest outcome is a
  // failure (long sessions normally work around transient tool errors)
  let lastFailureT = -Infinity;
  let lastSuccessT = -Infinity;
  for (const node of nodes.values()) {
    const t = node.end_time ?? node.start_time ?? 0;
    if (node.status === STATUS.FAILED) lastFailureT = Math.max(lastFailureT, t);
    else if (node.status === STATUS.SUCCESS) lastSuccessT = Math.max(lastSuccessT, t);
  }
  const lastKind = finalTurnReason?.kind;
  if (live && anyRunning) taskNode.status = STATUS.RUNNING;
  else if (lastKind === 'error') taskNode.status = STATUS.FAILED;
  else if (lastKind === 'aborted') taskNode.status = STATUS.CANCELLED;
  else if (lastFailureT > lastSuccessT) taskNode.status = STATUS.FAILED;
  else taskNode.status = STATUS.SUCCESS;

  const graph = {
    task_id: taskId,
    session_id: sessionId,
    workspace,
    title: taskNode.meta.title,
    cwd: header.cwd ?? null,
    status: taskNode.status,
    start_time: taskNode.start_time,
    end_time: taskNode.end_time,
    duration_ms: taskNode.duration_ms,
    nodes: [...nodes.values()],
    edges,
    meta: {
      header,
      live,
      tokens: tokenTotals,
      tool_name_counts: Object.fromEntries(toolNameCounts),
      final_turn_reason: finalTurnReason,
    },
  };
  graph.summary = summarize(graph);
  return graph;
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

/**
 * Compute the Task Summary block (spec §13) from a built graph.
 * Separately exported so the analytics/tests can use it directly.
 */
export function summarize(graph) {
  const count = (fn) => graph.nodes.reduce((acc, n) => (fn(n) ? acc + 1 : acc), 0);
  const typeCount = (t) => count((n) => n.type === t);
  const retries = graph.nodes.reduce((acc, n) => {
    const attempts = n.meta?.attempts?.length ?? 0;
    return acc + (attempts > 1 ? attempts - 1 : 0) + (n.type === NODE_TYPE.AGENT ? (n.meta?.attempts?.length ?? 0) : 0);
  }, 0);
  const errors = count((n) => n.status === STATUS.FAILED || n.meta?.error);
  const tokens = graph.meta?.tokens ?? { input: 0, output: 0, cache_read: 0 };
  const files = new Set();
  for (const node of graph.nodes) {
    if (node.type === NODE_TYPE.CODE && node.meta?.file) files.add(node.meta.file);
  }
  const steps = graph.nodes.filter((n) => n.type === NODE_TYPE.AGENT);
  const slowest = [...steps].sort((a, b) => (b.duration_ms ?? 0) - (a.duration_ms ?? 0)).slice(0, 3)
    .map((n) => ({ id: n.id, name: n.name, duration_ms: n.duration_ms }));
  const failedSteps = graph.nodes.filter((n) => (n.type === NODE_TYPE.AGENT || n.type === NODE_TYPE.TOOL || n.type === NODE_TYPE.TEST) && n.status === STATUS.FAILED)
    .map((n) => ({ id: n.id, name: n.name, error: n.meta?.error?.message ?? n.meta?.error?.code ?? null }));
  const retriedNodes = graph.nodes.filter((n) => (n.meta?.attempts?.length ?? 0) > 1 || n.meta?.retried)
    .map((n) => ({ id: n.id, name: n.name, attempts: n.meta?.attempts?.length ?? 1 }));
  const toolCounts = graph.meta?.tool_name_counts ?? {};
  const mostUsedTools = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, calls]) => ({ name, calls }));

  return {
    status: graph.status,
    duration_ms: graph.duration_ms,
    counts: {
      phases: typeCount(NODE_TYPE.PHASE),
      agents: typeCount(NODE_TYPE.AGENT),
      tools: typeCount(NODE_TYPE.TOOL),
      skills: typeCount(NODE_TYPE.SKILL),
      subagents: typeCount(NODE_TYPE.SUBAGENT),
      plans: typeCount(NODE_TYPE.PLAN),
      code_changes: typeCount(NODE_TYPE.CODE),
      tests: typeCount(NODE_TYPE.TEST),
      errors,
      retries,
      files_changed: files.size,
    },
    tokens: {
      input: tokens.input,
      output: tokens.output,
      cache_read: tokens.cache_read,
      total: tokens.input + tokens.output,
    },
    slowest_steps: slowest,
    failed_steps: failedSteps,
    retried_steps: retriedNodes,
    most_used_tools: mostUsedTools,
    files_changed: [...files],
  };
}
