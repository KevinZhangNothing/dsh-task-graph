# DSH 轨迹事件 → 图谱节点映射

会话文件：`$DSH_HOME/sessions/<workspace-slug>/<session-dir>/session.jsonl.zstd`
（zstd **多帧拼接**容器；Node ≥ 22.15 `zlib.zstdDecompressSync` 逐帧解码，残帧自动前缀解码）。

## 事件 → 节点

| 轨迹事件 | 图谱动作 |
| --- | --- |
| `session`（首行头） | `task` 根节点（id/cwd/delegationDepth/createdAt） |
| `session/title` | 任务标题 |
| `user/message` / `agent/inbox/spliced` | 缓存为下一个 phase 的 `user_message`（Turn 命名） |
| `turn/start` / `turn/end` | `phase` 节点开闭；`reason.kind`∈completed/error/aborted |
| `step/start` / `step/end` | `agent` 节点（一次 LLM 请求周期） |
| `request/header` / `request/context` | agent 的 `provider` / `model` |
| `assistant/chunk` `usage` | agent tokens（input/output/cacheRead） |
| `assistant/chunk` `finish` | agent `finish_reason` |
| `llm/retry` / `llm/retry-started` | agent `attempts[]`（failure message/code、delayMs），节点进入 `RETRYING` |
| `tool/call` | 按名称/参数分类建节点（下表）；`callId` 关联 |
| `tool/result` | 节点闭合；`isError`/`error` → `FAILED`；相同参数且上次失败 → 合并为下一个 attempt |
| `todo/write` | `plan` 节点（todos 状态列表） |
| `subagent/descriptor` | 子会话的 `label`（子任务标题） |

## 工具分类规则（`classifyTool`）

| 工具名 | 节点类型 |
| --- | --- |
| `skill` | `skill`（名称取 `arguments.name`） |
| `subagent` / `agent` / `spawn_agent` | `subagent`（关联子会话摘要，可下钻） |
| `todo_write` | `plan` |
| `edit` / `write` / `str_replace_editor` / `apply_patch` | `code`（`meta.file`） |
| `bash` 且命令匹配测试正则（`pytest/jest/vitest/flutter test/…`） | `test` |
| 其它 | `tool` |

## 子任务（SubTask）关联

子代理会话的头部携带 `parentSession` + `origin: "subagent"` + `delegationDepth>0`。
父会话里的 `subagent` 工具调用按 **`parentSession` 匹配 + 创建时间落在 `[call-5s, result+5s]` 窗口** 关联到子会话，
子会话摘要（标题/状态/计数/时长）挂到节点 `meta.child_session`，UI 提供"打开子任务图谱"下钻。

## 实时（live）判定

`mtime` 在 180s 内 **且** 事件流以未闭合的 `turn/start|step/start` 结尾 → 任务 `RUNNING`。
`/task-graph/api/live`（SSE）轮询文件：新帧解码后推送 `events`/`tick`，客户端增量重取图谱与事件。
