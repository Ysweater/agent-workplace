# Architecture

## 声明

**Agnes Agent Workspace 未复制 Claude Code 源码。** 本项目在理解 Claude Code 公开的产品形态与架构理念后，**借鉴其思想**（QueryEngine、Tool Registry、Context、Permission、可观测性），使用 **TypeScript 全栈** **独立实现** 了一套 Web 端 Agent 工作台。

架构核心是 **Agent Runtime**、**Tool Registry**、**Context Manager** 三件套；其余模块围绕这三者编排。

---

## 总体架构图

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         apps/web（React 工作台）                          │
│  ChatPanel          ExecutionTimeline        ToolCallPanel + ResultPreview│
│  任务输入            计划/步骤/状态            工具详情 + 产物预览          │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ HTTP request/response
                                     │ POST /api/agent/run
                                     │ GET  /api/health, /api/models, …
┌────────────────────────────────────▼─────────────────────────────────────┐
│                         apps/server（Express API）                        │
│  agent.controller   modelProvider.service   storage.service                │
│  agentSetup（ToolRegistry 装配 + Prompt 注入 + LLM 条件注入）              │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼─────────────────────────────────────┐
│                    packages/agent-core（Agent 核心）                        │
│                                                                           │
│   ┌─────────────┐    ┌──────────┐    ┌──────────┐    ┌─────────────────┐ │
│   │ AgentRuntime│───▶│ Planner  │───▶│ Executor │───▶│ ContextManager  │ │
│   │  编排入口    │    │ 计划生成  │    │ 逐步执行  │    │ 上下文累积       │ │
│   └──────┬──────┘    └────┬─────┘    └────┬─────┘    └─────────────────┘ │
│          │                │               │                                 │
│          │                │               ▼                                 │
│          │                │        ┌──────────────┐                       │
│          └────────────────┴───────▶│ ToolRegistry │                       │
│                                    │  工具白名单   │                       │
│                                    └──────┬───────┘                       │
└───────────────────────────────────────────┼───────────────────────────────┘
                                            │
              ┌─────────────────────────────┴─────────────────────────────┐
              ▼                                                           ▼
   packages/tools                                              packages/prompts
   web_search / research_report /                              system / planner /
   html_export / website_builder / summary                     research / website / summary
```

### 数据流（单次 Agent Run）

```
User Input
    │
    ▼
AgentRuntime.run(userInput, { taskTypeHint? })
    │
    ├─▶ ContextManager.createContext()     ← 初始化 task / 空 plan / 空 artifacts
    │
    ├─▶ Planner.createPlan()             ← classifyTaskType 或 hint → 计划步骤[]
    │       ├─ LLM 模式：buildSystemPrompt + buildPlannerPrompt → JSON 数组
    │       └─ Mock 模式：PLAN_TEMPLATES 确定性模板
    │
    ├─▶ validatePlan()                   ← 未知工具 → warning + 跳过
    │
    └─▶ Executor.executePlan()           ← 顺序执行每步
            ├─ buildToolInput(step, ctx)
            ├─ tool.execute(input, ctx)
            ├─ ContextManager.addToolCall / addArtifact
            └─ stepOutputs 累积供下一步使用

Final Result → context.artifacts + summary + trace
```

---

## AgentRuntime

**位置**：`packages/agent-core/src/AgentRuntime.ts`

**职责**：Agent 执行的**唯一编排入口**（对应 Claude Code 的 QueryEngine 思想）。将「用户任务」转化为「可验证的计划」，再驱动 Executor 逐步完成，并汇总最终结果与 Trace。

**关键行为**：

1. 解析 `taskTypeHint`（来自 API `agentType` 映射）或调用 `classifyTaskType(userInput)`。
2. 创建 `ContextManager`，写入初始 `task`。
3. 调用 `Planner.createPlan(userInput, tools, taskType)`。
4. `validatePlan`：注册表中不存在的工具标记为 `error` 并产生 `warning` trace；若无任何可执行步骤则 `failed`。
5. `Executor.executePlan` 顺序执行。
6. 组装 `AgentRunResult`：`status`、`context`、`trace`、`durationMs`。

**设计要点**：Runtime 不直接调用模型写报告或生成 HTML，一切能力通过工具和 Planner 计划暴露。

---

## Planner

**位置**：`packages/agent-core/src/Planner.ts`

**职责**：将用户自然语言任务拆解为**工具调用序列**（计划步骤）。每步包含 `title`、`toolName`、`reason`、`expectedOutput`。

**任务分类**（`classifyTaskType`）：

| 类型 | 典型输入特征 | 确定性模板工具链 |
|------|--------------|------------------|
| `research` | 以「调研」开头、研究报告、行业分析 | `web_search` → `research_report` → `html_export` → `summary` |
| `website` | 网站、小游戏、吃豆人、页面（非纯调研） | `website_builder` → `summary` |
| `summary` | 其他总结类 | `summary` |

**计划生成策略**：

| 模式 | 条件 | 行为 |
|------|------|------|
| **模板模式** | `MODEL_PROVIDER=mock` 或未配置 Key（服务端不注入 LLM） | 使用 `PLAN_TEMPLATES`，可复现 |
| **LLM 模式** | 已配置真实 Provider | `buildSystemPrompt` + `buildPlannerPrompt` → 模型只输出 JSON 数组 → schema 校验 → 失败则降级模板 |

**`taskTypeHint`**：`AgentRuntime.run` 传入的 hint **优先于** `classifyTaskType`，便于 API 显式指定任务类型。

---

## Executor

**位置**：`packages/agent-core/src/Executor.ts`

**职责**：按计划**顺序**执行每一步，是 QueryEngine「执行循环」的具体实现。

**关键行为**：

1. 从 `ToolRegistry` 按 `step.toolName` 获取工具定义。
2. `buildToolInput` 根据步骤与当前 `AgentContext` 构造统一入参（如 `web_search` 的 `query`、`research_report` 的 `topic` + `sources`）。
3. 调用 `tool.execute(input, ctx)`，记录 `ToolCallRecord`（含 input / output / 耗时 / 成功失败）。
4. 通过 `resolveArtifactFromOutput` 提取产物，由 **ContextManager** 写入 `artifacts`（工具本身不直接 mutate context）。
5. 更新步骤状态：`pending` → `running` → `success` / `error`。

**设计要点**：工具入参适配集中在 Executor，避免各工具重复解析 context。

---

## ContextManager

**位置**：`packages/agent-core/src/ContextManager.ts`

**职责**：维护单次 Agent Run 的**会话级状态**（对应 Claude Code 的 Context 思想）。所有状态 JSON 可序列化，便于存储与前端展示。

**核心字段**（`AgentContext`）：

| 字段 | 说明 |
|------|------|
| `task` | 用户输入、任务类型、创建时间 |
| `plan` | Planner 生成的步骤列表 |
| `toolCalls` | 每次工具调用的 input / output / 状态 |
| `stepOutputs` | 按 stepId 索引的步骤输出 |
| `stepTransitions` | 步骤状态变迁时间线 |
| `artifacts` | Markdown / HTML / 代码方案等中间与最终产物 |
| `finalResult` | 运行结束后的汇总 |

**设计要点**：

- 工具**不直接修改** `artifacts`；由 Executor 统一写入，保证单一事实来源。
- `stepTransitions` 支撑前端 ExecutionTimeline 的状态徽章与时间线。

---

## ToolRegistry

**位置**：`packages/agent-core/src/ToolRegistry.ts`

**职责**：**集中注册**所有 Agent 能力（对应 Claude Code 的 tools.ts / Tool.ts 思想）。

**API**：

- `register(tool)` — 注册工具
- `getTool(name)` / `hasTool(name)` — 按名查找
- `listTools()` — 列出全部（供 Planner Prompt 注入工具说明）

**装配位置**：`apps/server/src/lib/agentSetup.ts` 将 `packages/tools` 的 `allTools` 注册到单例 Registry。

**安全边界**：Planner 与 Executor 只能使用已注册工具名；未注册工具在 `validatePlan` 阶段被跳过。

---

## Tools

**位置**：`packages/tools/src/`

每个工具实现统一接口 `ToolDefinition`：

```typescript
{
  name: string;
  description: string;
  inputSchema: …;
  execute(input, ctx): Promise<ToolResult>;
}
```

| 工具名 | 文件 | 职责 | 典型输出 |
|--------|------|------|----------|
| `web_search` | `webSearchTool.ts` | 检索来源 | `sources[]`（S1、S2…） |
| `research_report` | `researchReportTool.ts` | 五段式中文报告 | `markdown`、`title` |
| `html_export` | `htmlExportTool.ts` | Markdown → HTML | `html`、`title` |
| `website_builder` | `websiteBuilderTool.ts` | 网站/小游戏方案 | `files[]`、`preview/index.html` |
| `summary` | `summaryTool.ts` | 执行总结 | `summary` 文本 |

**扩展方式**：在 `packages/tools` 新增工具 → 加入 `allTools` → 在 `PLAN_TEMPLATES` / Planner Prompt 中引用工具名。

---

## Model Provider

**位置**：`apps/server/src/services/modelProvider.service.ts`

**职责**：封装 OpenAI 兼容 Chat Completions API，并向 `agent-core` 提供 `LLMProvider` 适配器。

| Provider | 说明 |
|----------|------|
| `mock` | 无 Key 或显式 mock；**不注入 Planner** |
| `agnes` / `openai` / `deepseek` / `custom` | 真实 API 调用 |

**公开接口**：

- `GET /api/models` — 返回 `provider`、`model`、`configured`、`baseUrlMasked`（**不含 API Key**）
- `createModelProvider()` — 供 `AgentRuntime` 在已配置时使用

**降级策略**：

- 无 `MODEL_API_KEY` → `usingMock: true`
- API 调用失败 → 可记录日志；Planner 侧 JSON 解析失败时降级 `PLAN_TEMPLATES`

---

## Storage

**位置**：`apps/server/src/services/storage.service.ts`

**职责**：持久化 Agent 会话、报告、工具调用记录。

| 模式 | 配置 | 实现 |
|------|------|------|
| **JSON（默认）** | `STORAGE_DRIVER=json` | `storage/sessions/`、`reports/`、`tool_calls/` |
| **PostgreSQL** | `STORAGE_DRIVER=postgres` + `DATABASE_URL` | 自动建表，JSONB 存 payload |

**降级**：PostgreSQL 连接或运行失败时，**自动回退** JSON 文件存储；`GET /api/health` 的 `storage.fallback` 可观测。

**接口统一**：`saveSession` / `loadSession` / `saveReport` / `listReports` / `listToolCalls` 对上层透明。

---

## 可观测性

每次 Agent Run 产生 `TraceEvent` 序列：

| 类型 | 含义 |
|------|------|
| `plan` | 计划步骤 |
| `tool_call` | 工具调用开始 |
| `tool_result` | 工具返回 |
| `artifact` | 产物生成 |
| `warning` | 如未知工具被跳过 |
| `error` | 执行失败 |
| `done` | 任务结束 |

前端 `ExecutionTimeline` 展示计划与步骤状态；`ToolCallPanel` 展示调用详情；`ResultPreview` 展示产物。

---

## Claude Code 启发映射表

| Claude Code 概念 | 本项目模块 | 实现说明 |
|------------------|------------|----------|
| **QueryEngine** 多轮任务循环 | `AgentRuntime` + `Planner` + `Executor` | 任务 → 计划 → 逐步工具调用 → 最终产物 |
| **Tool.ts** 单工具抽象 | `ToolDefinition` | `name` / `description` / `execute` |
| **tools.ts** 工具注册表 | `ToolRegistry` + `agentSetup.ts` | 集中注册，按名调度 |
| **Context** 上下文 | `ContextManager` | task、plan、toolCalls、artifacts 累积 |
| **Permission** 权限边界 | 服务端 env + 工具白名单 | Key 不暴露；仅已注册工具可执行 |
| **可观测 Trace** | `trace.ts` + 前端 Timeline | 每步可追踪、可回放 |
| **降级 / 安全 Demo** | `MODEL_PROVIDER=mock` + Storage fallback | 无 Key 可演示；DB 故障不阻断 |

**再次强调**：上表为**架构思想映射**，代码为本项目 **TypeScript 独立实现**，与 Claude Code 源码无复制关系。

---

## Monorepo 分层原则

| 包 | 依赖方向 | 职责 |
|----|----------|------|
| `agent-core` | 无 UI、无 HTTP | 纯 Agent 逻辑，可单测 |
| `tools` | 依赖 agent-core 类型 | 工具实现 |
| `prompts` | 无运行时依赖 | 提示词模板 |
| `server` | core + tools + prompts | API、Provider、Storage |
| `web` | 仅 HTTP 调用 server | 工作台 UI |

修改 Prompt 文案不影响 Agent Core；新增工具只需 tools + Registry 注册。
