# DSH 单任务执行流程图谱 · 需求规格（存档）

> 本文件存档插件立项时的完整需求（原文要点逐条保留），实现状态见各节标注。

## 1. 目标 ✅

为 DSH 增加面向**单个任务（Task）**的可视化执行流程图谱。核心不是展示整个 Session 的聊天记录，而是让用户进入一个具体任务后一眼看到：

> 任务从开始 → Agent/Skill → 工具调用 → 子任务 → 业务知识 → 代码分析 → 修改 → 验证 → 成功/失败/重试 的完整执行过程。

支持实时执行状态与执行完成后的历史回溯。

## 2. 核心 UI ✅

进入 Task 后提供独立的 Task Flow / Execution Graph 视图（DSH 会话区覆盖层 + 侧边栏入口；demo 为全屏覆盖层 + 悬浮入口）。

## 3. 图谱节点类型 ✅（第三阶段项除外）

| 需求节点 | 实现 |
| --- | --- |
| Task（ID/标题/状态/起止/总时长） | `task` |
| Agent（名称/模型/输入/输出/Token/时长/状态） | `agent`（一次 LLM step） |
| Skill（名称/版本/输入/输出/状态/时长） | `skill`（`skill` 工具调用） |
| Tool（名称/输入/输出/时长/状态/错误） | `tool` |
| SubAgent/SubTask（父任务/子任务/状态/时长） | `subagent` + `meta.child_session`（可下钻） |
| Business Knowledge（来源/查询/检索内容/置信度/是否采用） | ⏳ 第三阶段 |
| Code Semantic Graph（符号/文件/生产/转换/消费/调用链） | ⏳ 第三阶段 |
| Code Change（文件/符号/diff/类型/状态） | `code`（edit/write 工具，`meta.file`） |
| Test/Validation（名称/命令/结果/时长/错误/重试次数） | `test`（测试命令启发式） |
| Error/Retry（类型/消息/关联节点/重试次数/恢复结果） | 节点 `attempts[]` + `retries` 自环边 + 错误面板 |

## 4. 节点关系 ✅

`contains / depends_on / calls / invokes / delegates / produces / consumes / modifies / validates / retries / recovers_from`（见 `docs/data-model.md`；recovers_from 以"恢复感知状态聚合"体现）。

## 5. 实时执行状态 ✅

状态机：`PENDING RUNNING SUCCESS FAILED SKIPPED CANCELLED RETRYING`。
UI：RUNNING = 高亮+脉冲动画；SKIPPED/CANCELLED 弱化；顶部 LIVE 徽标；SSE 增量刷新，当前执行节点一眼可辨。

## 6. 并行执行 ✅

同一步骤的并行工具调用渲染为 Fork → Join；并行分支各自状态与耗时可见；时间线视图下以并发条带呈现（另有 `performanceProfile.parallel_peak` 统计）。

## 7. 循环 / Retry ✅

Retry 不复制节点：相同调用（同参数）失败后重试聚合为一个节点的 `attempts[]`：

```text
Test ├─ Attempt #1 → FAIL ├─ Attempt #2 → FAIL └─ Attempt #3 → SUCCESS
```

LLM 重试（`llm/retry`）同样聚合进所属 step；节点右侧渲染 `×N` 重试弧。

## 8. 节点详情 Panel ✅

点击节点右侧打开详情：状态/时长/模型/Token、Input/Output（JSON 折叠展示）、错误、重试历史、关联文件、对应 Trajectory 事件列表。

## 9. Graph 与原始 Trajectory 联动 ✅

- 点节点 → Trajectory 抽屉高亮并滚动到对应事件行；
- 点事件行 → 反选并聚焦图谱节点；
- 节点保留 `event_ids`（seq）/`session_id`/`task_id`/时间戳；
- 事件行可展开完整原始 payload。

## 10. Graph 布局 ✅

DAG（分层，默认）/ Force（力导向探索）/ Timeline（按真实执行时间）。
交互：Zoom（滚轮）、Pan（拖拽）、Fit、Collapse/Expand、Search、Filter、Focus Node、Highlight Path（hover 邻域、关键路径、搜索命中）。

## 11. 图谱过滤 ✅

按类型过滤（phase/agent/tool/skill/subagent/code/test/plan 复选）；被过滤节点的上下文边自动穿透，保持可读。

## 12. 按执行层级折叠 ✅

Turn（phase）/Task 为分组节点，可折叠为带子节点计数的单节点；大任务（>14 turns）自动折叠中间轮次；"全部展开"一键还原。

## 13. Task Summary ✅

顶部摘要：状态/时长、Turn/Agent/Tool/Skill/SubAgent/代码改动/测试/重试/错误/文件数、Token 输入输出；
洞察行：Critical Path、最慢步骤、高频工具（失败步骤在详情/过滤中定位）。

## 14. Critical Path ✅

自动计算耗时主导链（去重的执行时长权重，LLM 步骤只计其非工具时间），⚡ 一键高亮节点与边，摘要显示其时长占比。

## 15. 错误定位 ✅

失败任务/节点标红；点失败节点看错误消息、输入输出、重试历史与恢复情况，并直达对应 Trajectory 事件。

## 16. 数据模型 ✅

`{task_id, nodes:[{id,type,name,status,start_time,end_time,duration_ms,event_ids,parent_id,…}], edges:[{source,target,type}]}` —— 见 `docs/data-model.md`。

## 17. 设计原则 ✅

Task First / Graph First / Detail on Demand / Trajectory 是底层数据 / 反映真实执行（LLM/Tool/Skill/SubAgent/Retry/Error/Parallel）。

## 18. MVP ✅ 全部完成

单 Task Graph、Task→Agent→Tool→Result、DAG、Success/Running/Failed、详情 Panel、Graph↔Trajectory、Zoom/Pan/Fit、Collapse/Expand、Retry 展示、实时更新。

## 19. 第二阶段 ✅ 基本完成

Skill、SubAgent/SubTask、并行、Retry/Loop、Critical Path、Timeline、Token/Cost、性能统计（parallel_peak）、Search/Filter、Task Summary。

## 20. 第三阶段 ⏳ 规划

面向 AI Coding / Bug Fix Agent：Business Knowledge 节点、代码语义图（Producer/Transformer/Consumer/调用链）、候选代码 → Patch → Test（FAIL→Diagnosis→Patch 闭环）的业务级图谱。
