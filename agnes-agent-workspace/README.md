# Agnes Agent Workspace

Web 端 Agent 工作台 — 任务驱动、工具调用、过程可观测。**TypeScript 全栈**独立实现，借鉴 Claude Code 的架构思想，**未复制 Claude Code 源码**。

---

## 项目背景

大模型应用正在从「单次问答」走向「多步任务执行」：用户提交的是调研、建站、生成报告等**任务**，系统需要规划步骤、调用工具、累积上下文，并产出可展示的结构化结果。

Agnes Agent Workspace 是一个可演示、可扩展的 **Agent 工作台原型**：在浏览器中完成「输入任务 → 查看执行轨迹 → 预览产物」的完整闭环，适合作为 Agent 产品形态的技术验证与评审 Demo。

---

## 项目目标

| 目标 | 说明 |
|------|------|
| **任务驱动** | 用户输入的是任务，而非闲聊；系统走「计划 → 执行 → 总结」 |
| **工具化能力** | 检索、写报告、导出 HTML、建站、总结等均通过标准工具完成 |
| **过程可观测** | 计划步骤、工具调用、产物在 UI 中可追踪 |
| **核心三件套** | **Agent Runtime**、**Tool Registry**、**Context Manager** 为架构核心 |
| **可演示降级** | 无 API Key 时 `MODEL_PROVIDER=mock`，Planner 使用确定性模板，仍可完整演示 |
| **存储可扩展** | 默认本地 JSON；可选云端 PostgreSQL，失败自动降级 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 语言 | **TypeScript**（前后端与共享包统一） |
| 前端 | React 19、Vite、Tailwind CSS |
| 后端 | Node.js、Express |
| Agent 核心 | `@agnes/agent-core`（Runtime / Planner / Executor / Context / Registry） |
| 工具层 | `@agnes/tools` |
| 提示词 | `@agnes/prompts` |
| 存储 | 本地 JSON 文件 / PostgreSQL（可选） |
| 工程 | npm workspaces Monorepo |

---

## Claude Code 启发点（思想借鉴，非源码复制）

本项目**没有复制 Claude Code 源码**，而是在阅读公开资料与产品形态后，**借鉴其架构思想**并**独立实现**了一套 Web 端 Agent 工作台：

| Claude Code 思想 | Agnes 实现 |
|------------------|------------|
| QueryEngine（多轮执行循环） | `AgentRuntime` → `Planner` → `Executor` |
| Tool.ts / tools.ts（标准工具注册） | `ToolRegistry` + `packages/tools` |
| Context（会话上下文累积） | `ContextManager` |
| Permission（权限与安全边界） | 后端密钥隔离、工具白名单、Mock 降级 |
| 可观测执行轨迹 | `TraceEvent` + 前端 `ExecutionTimeline` |

详见 [architecture.md](./architecture.md) 中的「Claude Code 启发映射表」。

补充说明：设计来源、Codex 页面交互参考、Hardness-like 工程组织方式，以及 loop engineering / checkpoint / resume 机制，见 [docs/engineering-lineage.md](./docs/engineering-lineage.md)。

---

## MVP 功能清单

### Agent 核心（`packages/agent-core`）

- [x] `AgentRuntime` — 编排计划生成与逐步执行
- [x] `Planner` — 任务分类、LLM/模板计划、`taskTypeHint` 支持
- [x] `Executor` — 顺序执行计划步骤、统一工具入参、产物写入 Context
- [x] `ContextManager` — 维护 task / plan / toolCalls / artifacts / stepTransitions
- [x] `ToolRegistry` — 工具注册与按名查找

### 工具（`packages/tools`）

- [x] `web_search` — 检索来源（Mock 来源 S1、S2…）
- [x] `research_report` — 五段式中文调研报告（Markdown）
- [x] `html_export` — Markdown → 可预览 HTML
- [x] `website_builder` — 网站/小游戏方案 + `preview/index.html`
- [x] `summary` — 执行总结

### 后端 API（`apps/server`）

- [x] `GET /api/health` — 健康检查、Provider、存储状态
- [x] `GET /api/models` — 公开模型配置（不含 API Key）
- [x] `POST /api/agent/run` — 运行 Agent 任务
- [x] `POST /api/agent/run-async` — 主 Agent 即时回复，后台执行 Workflow
- [x] `GET /api/agent/runs/:runId` — 查询异步运行结果与 checkpoint
- [x] `GET /api/agent/sessions/:sessionId` — 读取会话
- [x] `GET/POST /api/reports` — 报告列表与保存
- [x] `POST /api/export/html` — HTML 导出

### 前端工作台（`apps/web`）

- [x] 三栏布局：Chat | ExecutionTimeline | ToolCallPanel + ResultPreview
- [x] 示例任务快捷输入
- [x] Markdown / HTML / Website 产物预览

### 提示词（`packages/prompts`）

- [x] system / planner / research / website / summary 五类 Prompt 模板
- [x] Planner 运行时接入 `buildSystemPrompt` + `buildPlannerPrompt`

---

## 本地运行方式

### 环境要求

- Node.js **≥ 18**
- npm（随 Node 安装）

### 启动步骤

```bash
# 1. 进入项目根目录
cd agnes-agent-workspace

# 2. 安装依赖
npm install

# 3. 复制环境变量（Demo 可保持默认 mock）
cp .env.example .env

# 4. 启动开发环境（自动构建 packages 并同时启动前后端）
npm run dev
```

### 访问地址

| 服务 | 地址 |
|------|------|
| 前端工作台 | http://localhost:5173 |
| 后端 API | http://localhost:3001 |
| 健康检查 | http://localhost:3001/api/health |

### Agent 运行接口

| 接口 | 说明 |
|------|------|
| `POST /api/agent/run` | 同步运行，兼容原 Demo |
| `POST /api/agent/run-async` | 先返回即时回复和 `runId`，后台继续执行 Workflow |
| `GET /api/agent/runs/:runId` | 查询运行状态、最终产物和 checkpoint |

### 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 同时启动前后端 |
| `npm run dev:web` | 仅启动前端 |
| `npm run dev:server` | 仅启动后端 |
| `npm run build` | 构建所有包（验收前建议执行） |
| `npm run start` | 生产模式启动后端（需先 `npm run build`） |

---

## 环境变量说明

配置文件：项目根目录 `.env`（参考 [.env.example](./.env.example)）。**所有密钥与数据库连接串仅在后端读取，不会暴露给前端。**

### 模型 Provider

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MODEL_PROVIDER` | `mock` \| `agnes` \| `openai` \| `deepseek` \| `custom` | `mock` |
| `MODEL_BASE_URL` | OpenAI 兼容 API 地址（custom 时必填） | — |
| `MODEL_NAME` | 模型名称 | `gpt-4o-mini` |
| `MODEL_API_KEY` | API 密钥 | — |
| `MODEL_TEMPERATURE` | 采样温度 | `0.2` |

**Mock 模式行为**：`MODEL_PROVIDER=mock` 或未配置 `MODEL_API_KEY` 时，**不向 Planner 注入 LLM**，使用确定性 `PLAN_TEMPLATES` 生成计划，保证 Demo 可复现。

### 服务

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 后端监听端口 | `3001` |
| `NODE_ENV` | 运行环境 | `development` |

### 存储

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `STORAGE_DRIVER` | `json` \| `postgres` | `json` |
| `STORAGE_PATH` | JSON 模式数据目录 | `./storage` |
| `DATABASE_URL` | PostgreSQL 连接串（postgres 模式必填） | — |

---

## Demo 场景

### 主线 Demo：调研报告生成

**输入示例**：

```
调研 2026 年国内 AI Agent 产品发展趋势
```

**预期链路**：`web_search` → `research_report` → `html_export` → `summary`（4 次工具调用）

**预期产物**：Markdown 调研报告、HTML 预览、执行总结；右侧 ResultPreview 可切换 Markdown / HTML；左侧 ChatPanel 展示 Agent 摘要。

### 亮点 Demo：一键建站

**输入示例**：

```
随机生成一个有首屏和表单的品牌官网
```

**预期链路**：`website_builder` → `summary`（2 次工具调用）

**预期产物**：建站方案 + `files` 列表；Website 预览 Tab 展示 `website_builder` 输出的 `preview/index.html`。配置真实模型 API 后，`website_builder` 会优先调用模型按需求动态生成网站/小游戏文件；Mock 模式仅作为离线兜底。

### 降级 Demo：无 API Key

保持 `MODEL_PROVIDER=mock`，任意任务均可完整走通执行轨迹，无需真实模型 Key。

完整演示话术与讲解要点见 [demo-script.md](./demo-script.md)。

---

## 云端 PostgreSQL 可选部署说明

默认使用本地 JSON，适合开发与 Demo。生产或团队共享场景可切换 PostgreSQL：

```env
STORAGE_DRIVER=postgres
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/agnes
```

启动时自动建表（若不存在）：

| 表 | 说明 |
|----|------|
| `sessions` | Agent 会话（`payload` JSONB） |
| `reports` | 调研报告（title / markdown / html） |
| `tool_calls` | 工具调用记录（关联 `session_id`） |

**重要**：

- 连接信息**只能**来自环境变量 `DATABASE_URL`，代码中不写死账号密码。
- PostgreSQL 连接失败或运行中出错时，**自动降级**到本地 JSON 存储。
- `GET /api/health` 的 `storage` 字段可查看当前驱动及是否处于降级状态。

### 云端安全建议

- **不建议**将 `5432`（PostgreSQL）直接暴露到公网。
- 后端与数据库同机部署时，数据库建议只监听 `127.0.0.1`。
- 本地开发连接云库时，建议使用 **SSH Tunnel**，而非开放数据库端口。
- Redis、Elasticsearch 非 MVP 依赖，当前版本未接入。

---

## 安全注意事项

1. **API Key 隔离**：`MODEL_API_KEY` 仅存在于服务端 `.env`，前端通过 `/api/models` 获取脱敏配置（`baseUrlMasked`），不返回密钥。
2. **工具白名单**：Executor 仅调用 `ToolRegistry` 中已注册工具；计划中未知工具会被跳过并记录 warning。
3. **Mock 降级**：无 Key 时自动 Mock，避免 Demo 环境误用生产密钥。
4. **存储降级**：PostgreSQL 异常时回退 JSON，避免单点故障导致服务不可用。
5. **事实边界**：调研类工具与 Prompt 要求基于 sources 引用，禁止编造来源（见 `packages/prompts`）。

---

## 最终交付说明

本仓库为 **Agnes Agent Workspace MVP** 的完整交付物，包含：

| 交付物 | 路径 / 说明 |
|--------|-------------|
| 可运行 Monorepo | 根目录 `npm install` + `npm run dev` |
| Agent 核心 | `packages/agent-core` — Runtime / Planner / Executor / Context / Registry |
| 工具实现 | `packages/tools` — 检索、报告、建站、PPT、AIGC、总结等标准工具 |
| 提示词模板 | `packages/prompts` — 5 类 Prompt，已接入 Planner |
| 后端服务 | `apps/server` — Express API、Model Provider、Storage |
| 前端工作台 | `apps/web` — 三栏可观测 UI |
| 架构文档 | [architecture.md](./architecture.md) |
| AI Agent 技术标注 | [docs/agent-tech-map.md](./docs/agent-tech-map.md) |
| 提示词文档 | [prompts.md](./prompts.md) |
| 演示脚本 | [demo-script.md](./demo-script.md) |
| 环境模板 | [.env.example](./.env.example) |

**验收建议**：

```bash
npm run build
# 调研任务
curl -X POST http://localhost:3001/api/agent/run \
  -H "Content-Type: application/json" \
  -d '{"userInput":"调研 2026 年国内 AI Agent 产品发展趋势"}'
# 一键建站任务
curl -X POST http://localhost:3001/api/agent/run \
  -H "Content-Type: application/json" \
  -d '{"userInput":"随机生成一个有首屏和表单的品牌官网"}'
```

---

## 项目结构

```
agnes-agent-workspace/
├── apps/
│   ├── web/          # React + Vite + Tailwind 前端
│   └── server/       # Express API 服务
├── packages/
│   ├── agent-core/   # Agent Runtime（核心）
│   ├── tools/        # 工具注册与实现
│   └── prompts/      # 系统提示词模板
├── storage/          # 本地 JSON 存储（默认）
├── docs/
│   └── agent-tech-map.md
├── README.md
├── architecture.md
├── prompts.md
└── demo-script.md
```

---

## 相关文档

- [architecture.md](./architecture.md) — 总体架构与各模块说明
- [docs/agent-tech-map.md](./docs/agent-tech-map.md) — AI Agent 技术、参考产品与代码位置标注
- [prompts.md](./prompts.md) — 五类 Prompt 详解
- [demo-script.md](./demo-script.md) — 演示顺序与话术
