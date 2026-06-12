# Demo Script

Agnes Agent Workspace 现场演示脚本。适用于评审、答辩或内部分享。

**前提说明（开场必讲）**：

> 本项目是 **TypeScript 全栈**独立实现的 Web 端 Agent 工作台。我们**借鉴了 Claude Code 的架构思想**（QueryEngine、Tool Registry、Context、可观测 Trace），**没有复制 Claude Code 源码**。核心是三件套：**Agent Runtime**、**Tool Registry**、**Context Manager**。

---

## 前置条件

```bash
cd agnes-agent-workspace
npm install
cp .env.example .env   # 保持 MODEL_PROVIDER=mock 即可完整演示
npm run build          # 建议验收前执行
npm run dev
```

| 项 | 值 |
|----|-----|
| 前端 | http://localhost:5173 |
| 后端 | http://localhost:3001 |
| 健康检查 | `curl http://localhost:3001/api/health` |

确认 Header 显示 Provider 为 `mock`，Storage 为 `json`（或 postgres 未降级）。

---

## 演示顺序（推荐 15–20 分钟）

| 顺序 | 环节 | 时长 | 目的 |
|------|------|------|------|
| 1 | 开场 + 架构概览 | 2 min | 说明借鉴思想、核心三件套 |
| 2 | **主线 Demo：调研报告** | 6 min | 展示完整 4 步工具链与产物 |
| 3 | **亮点 Demo：一键建站** | 5 min | 展示按需求生成网站与 HTML 预览 |
| 4 | 可观测性讲解 | 3 min | Timeline、ToolCall、Context |
| 5 | Mock 降级 + 可选 PostgreSQL | 2 min | 无 Key 可演示、存储可扩展 |
| 6 | Q&A | 余下 | — |

---

## 环节 1：开场话术

**讲解要点**：

> 「传统 Chat 是一次问答；我们的 Agent 工作台是**任务驱动**的。用户提交调研或建站任务后，系统会先**规划步骤**，再**依次调用工具**，每一步都在中间栏 **Execution Timeline** 里可见。架构上，**Agent Runtime** 负责编排，**Tool Registry** 注册所有能力，**Context Manager** 累积计划、工具结果和产物——这三者是整个系统的核心。」

**可指向 UI**：

- 左栏 **ChatPanel**：任务输入
- 中栏 **ExecutionTimeline**：计划与步骤状态
- 右栏 **ToolCallPanel + ResultPreview**：调用详情与产物预览

---

## 环节 2：主线 Demo — 调研报告生成

### 演示话术

> 「第一条主线是**调研报告生成**，代表企业里最常见的 Agent 场景：给主题，要结构化报告和可预览 HTML。」

### 示例输入

在 ChatPanel 输入（或点击示例任务）：

```
调研 2026 年国内 AI Agent 产品发展趋势
```

### 预期输出

| 维度 | 预期 |
|------|------|
| **任务类型** | `research` |
| **计划步骤** | 4 步 |
| **工具调用顺序** | `web_search` → `research_report` → `html_export` → `summary` |
| **工具调用次数** | 4 |
| **产物** | Markdown 调研报告、HTML 预览、执行总结 |
| **右侧 Tab** | Markdown / HTML 可切换；左侧 ChatPanel 展示 Agent 摘要 |

### 讲解要点（执行过程中）

**1. Planner / QueryEngine 思想**

> 「第一步不是直接写报告，而是 **Planner** 根据任务类型生成计划。Mock 模式下用确定性模板，真实 Provider 下用 `buildPlannerPrompt` 让模型输出 JSON 步骤数组。这对应 Claude Code 的 **QueryEngine**：任务是多轮执行循环，不是一次生成。」

**2. 工具调用**

> 「看 Timeline：`web_search` 返回带来源编号 S1、S2…；`research_report` 基于 sources 写五段式中文报告；`html_export` 把 Markdown 转成可预览 HTML；最后 `summary` 收口。」

**3. Context 累积**

> 「每一步的输出都进入 **Context Manager**——`toolCalls`、`artifacts`、`stepOutputs` 串联起来，下一步工具能读到上一步结果。工具本身不直接改 Context，由 **Executor** 统一写入，保证单一事实来源。」

**4. 事实边界**

> 「调研 Prompt 要求引用 [S1]、[S2]，没有来源不能编造数字——这是 **Permission / Safety** 思想在 Prompt 层的体现。」

### API 验收（可选现场 curl）

```bash
curl -X POST http://localhost:3001/api/agent/run \
  -H "Content-Type: application/json" \
  -d "{\"userInput\":\"调研 2026 年国内 AI Agent 产品发展趋势\"}"
```

检查响应中 `context.toolCalls` 长度为 4，`artifacts` 含 markdown 与 html。

---

## 环节 3：亮点 Demo — 一键建站

### 演示话术

> 「第二条是亮点 Demo：**一键建站**。用户给一个网站目标，Agent 走 `website_builder → summary`，产出 `preview/index.html` 和文件列表。Mock 模式有离线兜底；配置真实模型 API 后，网站内容会由模型按需求动态生成。」

### 示例输入

```
随机生成一个有首屏和表单的品牌官网
```

### 预期输出

| 维度 | 预期 |
|------|------|
| **任务类型** | `website` |
| **工具调用顺序** | `website_builder` → `summary` |
| **工具调用次数** | 2 |
| **关键产物** | `files` 列表含 `preview/index.html` |
| **右侧 Tab** | Preview 展示生成的网站页面 |
| **不应出现** | `web_search`、`research_report`（非调研链路） |

### 讲解要点

**1. 任务分类**

> 「输入里有『官网』『网站』『落地页』『页面』等建站意图，**classifyTaskType** 识别为 website，Planner 走 `website_builder → summary`，不会误走调研四步链。」

**2. 可交付产物**

> 「`website_builder` 不只返回文字方案，还返回 **files** 和 **preview/index.html**。右侧 Preview 用 iframe 预览——强调 Agent 产物是**可展示、可评审**的，不是空谈。真实模型模式下，工具会优先调用模型动态生成；Mock 模式只是兜底。」

**3. 与主线对比**

> 「调研 Demo 展示**长链路、多工具、多产物**；一键建站 Demo 展示**短链路、代码产物、即时预览**——两条线共用同一套 Runtime / Registry / Context。」

---

## 环节 4：工具调用与上下文管理（深入讲解）

### 工具调用话术

> 「所有能力都是 **Tool Registry** 里的标准工具：`name`、`description`、`execute`。Planner 只能规划已注册工具名；Executor 按名查找；未注册工具会在计划校验阶段被跳过并产生 warning。新增能力只需在 `packages/tools` 注册，不用改 Runtime 核心。」

**指向 ToolCallPanel**：

- 展示某步的 `input` / `output` JSON
- 说明 `web_search` 的 `query`、`research_report` 的 `topic` + `sources` 由 Executor 统一适配

### 上下文管理话术

> 「**ContextManager** 在一次 Run 内维护完整状态：`task` 是用户原始输入；`plan` 是 Planner 输出；`toolCalls` 记录每次调用；`artifacts` 是 Markdown、HTML、游戏文件等；`stepTransitions` 驱动 Timeline 上的状态徽章。整份 context 会序列化存到 `storage/sessions/`，支持回放与审计。」

### Claude Code 架构启发（对照表口述）

| 我们说 | 对应模块 |
|--------|----------|
| 多轮任务循环 | AgentRuntime + Planner + Executor |
| 工具注册表 | ToolRegistry + packages/tools |
| 会话上下文 | ContextManager |
| 密钥与降级 | 后端 .env + MODEL_PROVIDER=mock |
| 执行轨迹 | TraceEvent + ExecutionTimeline |

---

## 环节 5：Mock 降级与存储

### Mock 降级话术

> 「`.env` 里 `MODEL_PROVIDER=mock` 时，**不向 Planner 注入 LLM**，直接用 `PLAN_TEMPLATES`，Demo 可复现、无需 API Key。配置 `MODEL_API_KEY` 后切换真实 Provider，Planner 使用 `packages/prompts` 的 System + Planner Prompt。」

### 存储话术（可选）

> 「默认 JSON 存在 `storage/`；设 `STORAGE_DRIVER=postgres` 可接云端库，连接失败自动降级 JSON。`GET /api/health` 可看 storage 状态。」

---

## 环节 6：收尾话术

> 「总结：Agnes Agent Workspace 用 **TypeScript 全栈**实现了任务驱动的 Agent 工作台。**主线 Demo** 是调研报告四步链；**亮点 Demo** 是一键建站预览。核心是 **Agent Runtime、Tool Registry、Context Manager**；思想借鉴 Claude Code，代码完全自研。后续可扩展真实搜索、更多工具、流式 Trace 等，但 MVP 已覆盖计划—执行—观测—交付闭环。」

---

## 快速检查清单

| 检查项 | 调研任务 | 一键建站任务 |
|--------|----------|------------|
| `npm run build` 通过 | ✓ | ✓ |
| 工具调用次数 | 4 | 2 |
| 工具链 | web_search → research_report → html_export → summary | website_builder → summary |
| 产物 | markdown + html；摘要见左侧 ChatPanel | html（含 preview/index.html）；摘要见左侧 ChatPanel |
| Timeline 步骤状态 | 全部 success | 全部 success |
| Provider mock 可运行 | ✓ | ✓ |

---

## 常见问题应答

**Q：和 Claude Code 什么关系？**  
A：借鉴公开架构思想独立实现，未复制源码；我们是 Web 工作台 + TypeScript Monorepo，面向任务演示与扩展。

**Q：没有 API Key 能演示吗？**  
A：能。Mock 模式用确定性计划模板，工具层有 Mock 数据，完整轨迹可见。

**Q：为什么调研要四步？**  
A：检索 → 写报告 → 导出 HTML → 总结，对应可观测的多工具协作；每步产物不同，便于评审各阶段质量。

**Q：一键建站是不是硬编码？**  
A：Mock 模式有模板兜底，保证离线演示不断；配置真实模型 API 后，`website_builder` 会把用户需求交给模型生成 `preview/index.html` 与文件列表。吃豆人只是可选测试输入，不是核心卖点。
