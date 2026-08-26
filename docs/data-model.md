# 图谱数据模型

`buildGraph(events, options)` 的输出（也是 `/task-graph/api/task` 的响应体）：

```json
{
  "task_id": "session id",
  "session_id": "session id",
  "workspace": "--Users-kevin-Desktop-Nothing-Napkin--",
  "title": "NIS-11688 修复草稿保存崩溃",
  "cwd": "/Users/kevin/Desktop/Nothing/Napkin",
  "status": "SUCCESS",
  "start_time": 1787600000000,
  "end_time": 1787600152000,
  "duration_ms": 152000,
  "nodes": [ … ],
  "edges": [ … ],
  "summary": { … },
  "critical_path": { "node_ids": [], "hot_node_ids": [], "edge_ids": [], "duration_ms": 0, "total_ms": 0 },
  "meta": { "header": {}, "live": false, "tokens": {}, "tool_name_counts": {}, "final_turn_reason": {} }
}
```

## 节点（Node）

| 字段 | 说明 |
| --- | --- |
| `id` | 稳定标识：`task` / `phase-<turn>` / `step-<turn>-<step>` / `tool-<callId>` |
| `type` | `task` `phase` `agent` `tool` `skill` `subagent` `code` `test` `plan` |
| `name` | 展示名（任务标题 / Turn 首条用户消息 / `LLM t.s` / 工具名 / `skill:<name>` / 文件名） |
| `status` | `PENDING` `RUNNING` `SUCCESS` `FAILED` `SKIPPED` `CANCELLED` `RETRYING` |
| `start_time` / `end_time` / `duration_ms` | 毫秒时间戳；重试节点的时长 = 各 attempt 时长之和（而非首尾跨度） |
| `event_ids` | 产生/关闭该节点的轨迹事件 `seq` 列表 —— Graph↔Trajectory 联动的钥匙 |
| `session_id` / `task_id` / `parent_id` | 轨迹联动三元组 + 层级折叠依据 |
| `meta` | 类型专属字段，见下表 |

### meta 字段（按类型）

| 类型 | 关键 meta |
| --- | --- |
| `task` | `cwd` `title` `user_request` `delegation_depth` `workspace` |
| `phase` | `turn` `user_message` `reason` |
| `agent` | `turn` `step` `provider` `model` `tokens{input,output,cache_read}` `finish_reason` `attempts[]`（LLM 重试，含 `failure{message,code}`） `tool_call_count` |
| `tool`/`test` | `tool_name` `call_id` `arguments` `output` `error` `attempts[]`（每次尝试 `status/start/end/error/event_ids`） `command`(test) |
| `skill` | `tool_name=skill` `arguments{name}` `output` |
| `subagent` | `arguments{description,prompt}` + `child_session{id,ref,title,status,counts}`（匹配到子会话时） |
| `code` | `file`（edit/write 的目标文件） |
| `plan` | `todos[{content,status}]` |

## 边（Edge）

```json
{ "id": "e42", "source": "step-2-1", "target": "tool-call_x", "type": "calls", "meta": {} }
```

| type | 语义 |
| --- | --- |
| `contains` | 层级：task→phase→step→tool（折叠/展开用） |
| `depends_on` | 时序主干：task→首个 phase、phase→phase、phase→首个 step、step→step |
| `calls` / `invokes` / `delegates` | step→普通工具 / skill / subagent |
| `modifies` / `validates` | step→代码改动 / 测试执行 |
| `consumes` | 工具结果汇入下一个 LLM step（并行工具形成 fork→join） |
| `produces` | step→plan |
| `retries` | 自环边（source==target）：该节点存在重试，`meta.attempts`=尝试次数 |

> 关键路径只走时序/执行边（`depends_on/calls/invokes/delegates/consumes/modifies/validates/produces`），
> 不走 `contains`（否则会"瞬移"进任意 phase）。

## Summary

`summary.counts`：`phases agents tools skills subagents plans code_changes tests errors retries files_changed`
`summary.tokens`：`input output cache_read total`
另有 `slowest_steps`（Top3）、`failed_steps`、`retried_steps`、`most_used_tools`、`files_changed`。

## 状态语义

- 节点级：工具失败后若以相同参数重发 → 合并为同一节点的下一个 attempt；最终成功则节点 `SUCCESS + retried`。
- LLM 重试（`llm/retry`）记入所属 step 的 `attempts`，step 最终成功仍为 `SUCCESS + retried`。
- 阶段/任务级"恢复感知"：只有**最后的结局是失败**才标红 —— 长会话里被绕过的历史错误不让任务变红。
- `live` 模式下未闭合节点保持 `RUNNING`；归档会话里未闭合节点标记为 `CANCELLED/FAILED` 且 `meta.unclosed=true`。
