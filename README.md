# dsh-task-graph · DSH 单任务执行流程图谱

**中文** | [English](README_EN.md)

> 给 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/dsh) 的**单个任务**画一张可交互的执行流程图谱：从 `任务开始 → Agent / Skill / Tool → 子任务 → 代码改动 → 测试 → 成功 / 失败 / 重试` 一眼看清，支持实时执行状态与历史回溯。

![图谱总览（横向 DAG · 类型色块 · 关键节点）](docs/images/hero.png)

- **Task First**：第一层概念是 Task（一次会话），不是 Session / Message / Event 流水。
- **Graph First**：进入任务先看到执行图谱，而不是一长串日志。
- **Detail on Demand**：画布只放关键节点；每一步具体做了什么（每个 LLM 步骤、每次工具调用、输入输出、错误、重试）都收进右侧详情面板。
- **Trajectory 是底层数据**：图谱由 `session.jsonl`（zstd）解析而来，节点保留 Event ID，可与原始 Trajectory 双向跳转。

---

## 设计语言

一次克制的信息可视化，融合四种气质：

| 取向 | 落到产品上 |
| --- | --- |
| **Apple 的克制** | 发丝线边框、低饱和配色、柔光无重阴影、状态用「染色 + 圆点」而非色块 |
| **Linear 的信息密度** | 紧凑工具栏、等宽数字、高密度详情日志、单屏放下更多 |
| **Vercel 的视觉精度** | 全局 `tabular-nums`、大写微标签、像素级对齐、仅浮层带分层阴影 |
| **AI Agent 的实时执行感** | 运行节点脉冲 + 秒级计时、活动边虚线流动、LIVE 徽标呼吸 |

视觉上采用**玻璃拟态**：图谱 / 详情 / 轨迹与「对话」「轨迹」两个原生 Tab 一样透出皮肤壁纸；每张卡片按**节点类型**染上专属半透明色调（任务蓝 · 轮次靛 · Agent 青 · 工具石灰 · Skill 紫 · 子代理琥珀 · 计划绿 · 代码橙 · 测试天蓝）。

---

## 功能总览

### 关键节点视图（默认画布）

画布只呈现**语义上重要**的节点，避免被几百个步骤淹没：

- **Turn** 节点：带摘要行（`N steps · N tools · N tok · ↻重试 · ✗失败`）
- **代码改动**批量节点：同一轮多处 edit 聚合为 `×N · M files` 一张卡
- 保留的关键事件：**Plan / Skill / SubAgent / 测试 / 失败或重试过的工具 / LLM 重试**
- 普通步骤与读取类工具不上图——它们都在详情里

![详情面板：批量代码改动可下钻到每一处](docs/images/detail.png)

点击任意关键节点，右侧详情面板展示**具体做了什么**：

- 点 **Turn** → 「执行明细 · N steps」：每个 LLM 步骤（模型 / 耗时 / Token / 重试）+ 其下全部工具调用
- 点 **代码改动** → 「包含 N 处改动」：文件级列表，点任意一行继续下钻到该编辑的输入 / 输出
- 任意工具行可点击，继续深入该节点详情

### 布局与交互

- **横向 DAG（默认）**：会话区是横向画幅，图谱从左到右流动、轮次成列；一键切换「⇄ 横向 / ⇅ 纵向」
- **时间线**：按真实执行时刻铺开，直观看到并行与耗时
- **力导向**：自由探索复杂关系
- 缩放 / 平移 / 适配、按层级折叠展开、按类型过滤、搜索、聚焦节点、邻域高亮

![时间线布局](docs/images/timeline.png)

### 实时执行状态

会话运行时通过 **SSE 增量刷新**：

- `RUNNING` 节点脉冲高亮 + **秒级计时**（`18.2s · running` 实时跳动）
- 连接运行节点的边呈**虚线流动**，表达数据正在流动
- 顶部 **LIVE** 徽标；节点状态机 `PENDING / RUNNING / SUCCESS / FAILED / SKIPPED / CANCELLED / RETRYING`

### 图谱 ↔ Trajectory 双向联动

- 点节点 → 轨迹抽屉高亮并滚动到对应事件
- 点事件行 → 反选并聚焦图谱节点
- 节点保留 `event_ids` / `session_id` / `task_id` / 时间戳，随时回答「这个节点对应哪条 Event」
- 「轨迹」Tab 与「对话」「图谱」一致，同为玻璃透明

![轨迹视图（玻璃透明）](docs/images/trajectory.png)

### 分析与定位

- **关键路径**：自动计算耗时主导链并高亮（关键视图下投影到轮次级）
- **错误定位**：失败节点标红，聚合错误消息 / 输入输出 / 重试历史 / 恢复动作
- **重试聚合**：相同调用失败后重试不复制节点，聚合为一个节点的多个 attempt + 重试弧
- **任务摘要**：耗时、轮次 / Agent / 工具 / Skill / 子代理 / 代码改动 / 测试 / 重试 / 错误计数、Token、最慢步骤、高频工具
- **并行执行**：同一步骤内并行工具渲染为 fork → join
- **子任务下钻**：SubAgent 节点关联子会话，一键打开子任务图谱

---
## 快速开始

### 独立 Demo（无需安装 DSH）

```bash
npm run demo            # 使用内置脚本化数据（含一个"正在运行"的任务，可看实时效果）
npm run demo -- --real  # 读取你本机真实 $DSH_HOME 会话
npm run demo -- --port 8123
```

打开打印出的地址即可；图谱会悬浮在页面上，自动加载任务。

### 作为 DSH 插件安装（一行命令）

```bash
dsh plugin --profile web add github:KevinZhangNothing/dsh-task-graph
```

`dsh plugin` 会调用 pnpm 安装，并**自动**把声明了 `dsh.bundle` 的包注册进 `dsh.profile.bundles`（已实测）。重启引擎（或重新加载 Web UI）后，原生「对话 / 轨迹」标签旁会出现第三个「**图谱**」Tab。

> 发布到 npm 后即可直接 `dsh plugin --profile web add dsh-task-graph`；
> 也可以在插件市场（dshmarket）里搜索安装。

点击「图谱」后只在内容区展示任务执行图谱——标签栏、侧边栏与其它功能入口保持可见。点回「对话 / 轨迹」或按 `Esc` 即恢复原视图。

### 本地开发安装

```bash
cd "$DSH_HOME/profiles/web"
dsh plugin --profile web add link:/path/to/dsh-task-graph
# 或手工：pnpm add "dsh-task-graph@link:/path/to/dsh-task-graph"
```

> 服务端需要 Node ≥ 22.15（用内置 `zlib.zstdDecompressSync` 解码 `.zstd` 会话，零原生依赖）。

---

## 架构

```
DSH session.jsonl (zstd, 多帧)
        │  lib/sessions.js  逐帧解码 + 缓存 + 增量
        ▼
lib/graph.js  buildGraph(events)      ← 纯函数，Node/浏览器通用
        │   nodes[] + edges[] + summary
        ▼
lib/analytics.js  criticalPath / performanceProfile
        ▼
lib/routes.js  createApi(store)       ← /task-graph/api/*（任务列表/图谱/事件/单事件）
        │                               + startLiveStream(SSE 实时尾随)
        ├──────────────┬───────────────────────────┐
        ▼              ▼                            ▼
 lib/index.js     demo/server.mjs            lib/client.js
 (DSH webServer    (独立 demo 服务)          (浏览器 UI：SVG 渲染、布局、
  挂载 HTTP 路由)                            详情面板、Trajectory 联动)
```

- **`lib/graph.js` / `lib/analytics.js`** 是纯模块，被服务端、demo、单测共享，保证"同一套构建逻辑"。
- **`lib/client.js`** 零依赖纯 DOM + SVG；既能被 DSH 的 `window.__ModuleLoader__` 加载，也能被 demo 页当作普通 `<script>` 直接运行。

## HTTP API

所有接口均为只读 `GET`，前缀 `/task-graph`：

| 路由 | 说明 |
| --- | --- |
| `/task-graph/api/status` | 健康检查、版本、DSH_HOME |
| `/task-graph/api/tasks?roots=true&q=&limit=` | 任务（会话）列表 + 摘要统计 |
| `/task-graph/api/task?id=<workspace>/<dir>` | 完整图谱（nodes/edges/summary/critical_path） |
| `/task-graph/api/events?id=…&from=` | 紧凑轨迹事件（用于联动抽屉） |
| `/task-graph/api/event?id=…&seq=` | 单条事件完整 payload |
| `/task-graph/api/live?id=…` | SSE 实时尾随新事件 |

## 数据模型

图谱统一为（详见 [`docs/data-model.md`](docs/data-model.md)）：

```json
{
  "task_id": "…",
  "nodes": [{ "id": "…", "type": "agent", "status": "SUCCESS", "event_ids": [12, 13], "parent_id": "phase-1", "…": "…" }],
  "edges": [{ "source": "…", "target": "…", "type": "calls" }]
}
```

- 节点类型：`task / phase / agent / tool / skill / subagent / code / test / plan`
- 节点状态：`PENDING / RUNNING / SUCCESS / FAILED / SKIPPED / CANCELLED / RETRYING`
- 边类型：`contains / depends_on / calls / invokes / delegates / consumes / modifies / validates / produces / retries`

## 开发

```bash
npm test        # node:test 单测（30 例）
npm run demo    # 本地预览
```

目录结构：

```
lib/        index.js 服务端入口 · sessions.js 解码 · graph.js 构建 ·
            analytics.js 分析 · routes.js HTTP API · client.js 浏览器 UI
demo/       server.mjs · index.html · sample-events.js（脚本化数据）
test/       node:test 单测 + fixtures
docs/       data-model.md · trajectory-events.md · spec.md · images/
```

## 路线图

- [x] MVP：单任务图谱、Task→Agent→Tool→Result、DAG、状态、详情、Graph↔Trajectory、缩放/折叠、重试、实时
- [x] 第二阶段：Skill/SubAgent、并行、循环、关键路径、时间线、Token/摘要、搜索/过滤
- [x] 体验打磨：关键节点视图、类型色块卡片、横向布局、玻璃透明主题、实时计时/流动边
- [ ] 第三阶段：业务知识节点、代码语义图（Producer/Transformer/Consumer、调用链）、候选代码→Patch→Test 闭环

## License

MIT