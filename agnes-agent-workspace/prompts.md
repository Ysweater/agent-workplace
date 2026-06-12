# Prompts Guide

运行时提示词位于 `packages/prompts/src/`，与 Agent Core、工具层解耦。服务端在 **LLM 规划模式**下通过 `apps/server/src/lib/agentSetup.ts` 注入：

- **System**：`buildSystemPrompt` + `ToolRegistry` 工具说明
- **Planner User**：`buildPlannerPrompt` + 用户任务与任务类型

**Mock 模式**（`MODEL_PROVIDER=mock`）不向 Planner 注入 LLM，使用确定性 `PLAN_TEMPLATES`；Prompt 仍作为真实 Provider 模式下的规范与文档交付。

本项目**未复制 Claude Code 源码**；Prompt 设计对应其 **QueryEngine、Tool、Context、Permission** 等架构思想的独立实现。

---

## 文件一览

| 文件 | 导出函数 | 运行时接入点 |
|------|----------|--------------|
| `system.prompt.ts` | `buildSystemPrompt` | Planner LLM 调用的 system 消息 |
| `planner.prompt.ts` | `buildPlannerPrompt` | Planner LLM 调用的 user 消息 |
| `research.prompt.ts` | `buildResearchPrompt` | 调研报告撰写规范（工具/Prompt 参考） |
| `website.prompt.ts` | `buildWebsitePrompt` | 建站/游戏构建规范（工具/Prompt 参考） |
| `summary.prompt.ts` | `buildSummaryPrompt` | 执行总结规范（summary 工具参考） |

---

## 1. System Prompt

**文件**：`packages/prompts/src/system.prompt.ts`  
**函数**：`buildSystemPrompt(options)`

### 用途

定义 Agnes 作为 **Web 端 Agent 工作台**的全局角色与行为边界。约束 Agent 必须走「计划 → 工具调用 → 总结」，强调工具结果优先、不编造事实、输出可追踪。

对应 Claude Code 思想：**QueryEngine + Context + Permission** — Agent 不是单次问答，而是有边界、可观测的执行体。

### 输入

```typescript
buildSystemPrompt({
  agentType: 'research' | 'website' | 'writing' | 'analysis' | 'presentation' | 'media' | 'summary',
  toolDescriptions?: string,  // 来自 ToolRegistry，动态注入
})
```

| 参数 | 说明 |
|------|------|
| `agentType` | 当前任务模式，写入 Prompt 正文 |
| `toolDescriptions` | 每行 `- toolName: description`，由 Registry 生成 |

### 输出

多段**中文**系统提示字符串，核心章节包括：

- 产品定位（任务驱动，非聊天机器人）
- 核心执行原则（多轮执行、工具结果优先、不编造、结构化输出、安全边界）
- 行为约束（拆解步骤、优先工具、说明期望产出）
- 可用工具列表（若提供 `toolDescriptions`）

### 设计原因

1. **与 Runtime 解耦**：修改文案不改 `agent-core`。
2. **动态工具边界**：`toolDescriptions` 来自 `ToolRegistry`，避免模型臆造未注册工具。
3. **统一安全口径**：调研类引用 sources、密钥仅在后端等规则在 System 层一次性声明。
4. **支撑 LLM Planner**：作为 `chat([{ role: 'system', … }])` 的第一条消息，与 Planner User Prompt 配合。

### 核心片段（摘要）

```
你是 Agnes，运行在 Agnes Agent Workspace —— 一个 Web 端 Agent 工作台。
你不是普通聊天机器人。用户提交的是任务，你必须通过 计划 → 工具调用 → 总结 完成任务。
事实、数据、报告内容必须来自工具返回值或用户输入。
调研类任务必须基于 sources 并引用 [S1]、[S2] 等编号。
```

---

## 2. Planner Prompt

**文件**：`packages/prompts/src/planner.prompt.ts`  
**函数**：`buildPlannerPrompt(options)`

### 用途

指导模型将用户任务拆解为**可执行步骤**，每步绑定一个已注册 `toolName`。要求模型**只输出 JSON 数组**，供 Planner 解析并做 schema 校验；失败则降级 `PLAN_TEMPLATES`。

对应 Claude Code 思想：**tools.ts + Tool.ts** — 计划即工具调用序列，而非自由文本。

### 输入

```typescript
buildPlannerPrompt({
  taskType: 'research' | 'website' | 'writing' | 'analysis' | 'presentation' | 'media' | 'summary',
  availableTools?: string[],
  userInput?: string,
})
```

### 输出

规划器 **User 消息**字符串，包含：

- 用户任务原文
- 任务类型与工具策略提示
- 已注册工具名列表
- JSON 数组格式说明与示例
- 按任务类型的步骤数量规则

**模型应输出的 JSON 结构**（每元素）：

```json
{
  "stepId": "step-1",
  "title": "步骤标题",
  "toolName": "web_search",
  "reason": "为何需要此步骤",
  "expectedOutput": "此步骤期望产出的内容描述"
}
```

### 推荐工具链

| 任务类型 | 步骤数 | 推荐工具链 |
|----------|--------|------------|
| `research` | 4–5 步 | `prompt_enhancer` → `web_search` → `research_report` → `html_export` → `summary` |
| `website` | 3 步 | `prompt_enhancer` → `website_builder` → `summary` |
| `presentation` | 3 步 | `prompt_enhancer` → `presentation_generator` → `summary` |
| `media` | 3–4 步 | `prompt_enhancer` → `image_generator` / `video_generator` → `summary` |
| `writing` / `analysis` | 3–4 步 | `prompt_enhancer` → `document_generator` → `html_export` → `summary` |
| `summary` | 1–2 步 | `summary` |
| fallback | 按复杂度 | 须可计划、可工具调用、可追踪 |

`Planner.normalizePlanForTaskType` 会在真实模型漏掉 `prompt_enhancer` 时自动补齐。`research` 更严格：如果模型把调研任务误规划成 `website_builder`、`presentation_generator` 等生成链路，系统会丢弃该计划并恢复固定 research 链路，避免调研请求弹出建站页面。

### 设计原因

1. **结构化计划**：JSON 数组便于 `Planner.parsePlanSteps` 校验与降级。
2. **任务分型**：调研与建站工具链不同，避免一律 `web_search → research_report`。
3. **snake_case 工具名**：与 `packages/tools` 注册名一致，减少 Executor 查找失败。
4. **中文场景**：示例与规则面向国内调研/演示评审。

### 运行时行为

```
LLM 模式：buildSystemPrompt + buildPlannerPrompt → chat → 解析 JSON → schema 校验
Mock 模式：不调用 LLM，直接使用 PLAN_TEMPLATES（与上表工具链一致）
```

---

## 3. Research Prompt

**文件**：`packages/prompts/src/research.prompt.ts`  
**函数**：`buildResearchPrompt(options)`

### 用途

约束 **中文调研报告**的撰写格式与事实边界，供 `research_report` 工具逻辑或未来 LLM 增强生成时引用。

对应 Claude Code 思想：**Permission / Safety** — 无来源不断言，工具输出即事实边界。

### 输入

```typescript
buildResearchPrompt({
  topic?: string,
  sourceIds?: string[],  // 如 ['S1','S2','S3']
})
```

| 参数 | 说明 |
|------|------|
| `topic` | 调研主题 |
| `sourceIds` | `web_search` 返回的来源编号 |

### 输出

调研撰写提示字符串，规定：

**固定五段式结构**：

1. 一、背景分析  
2. 二、核心发现  
3. 三、数据与事实  
4. 四、趋势分析  
5. 五、结论与建议  

**事实约束**：

- 只基于 sources；数字/时间/公司/政策须标注 `[S1]`、`[S2]`
- 不足时写「当前来源不足以确认」
- 禁止无来源的具体断言

**产物字段**：`markdown`（正文）、`title`（报告标题）

### 设计原因

1. **可核验报告**：引用编号与 Execution Trace 中 `web_search` 输出对应。
2. **统一评审格式**：五段式便于 ResultPreview 展示与人工检查。
3. **防幻觉**：明确禁止「据业内普遍认知」类无出处表述。
4. **主线 Demo 支撑**：「调研 2026 年国内 AI Agent…」依赖此规范产出 Markdown + HTML。

---

## 4. Website Prompt

**文件**：`packages/prompts/src/website.prompt.ts`  
**函数**：`buildWebsitePrompt(options)`

### 用途

指导 `website_builder` 产出**可展示、可预览**的网站或小游戏方案，而非空泛概念描述。

对应 Claude Code 思想：**Artifact + 可观测** — 产物必须可交付、可在 UI 中预览。

### 输入

```typescript
buildWebsitePrompt({
  requirement?: string,
  isGame?: boolean,  // 未传时根据 requirement 关键词推断
})
```

### 输出

建站/游戏构建提示，要求输出：

| 字段 | 说明 |
|------|------|
| `title` | 方案标题 |
| `description` | 简要说明 |
| `files` | `[{ path, language, content }]` |
| `previewNotes` | 如何预览 |

**普通网站**：Hero / Features / CTA 结构、React 片段、交互说明。

**小游戏（含吃豆人）**：

| 维度 | 要求 |
|------|------|
| 玩法 | 目标、核心循环 |
| 状态 | score、lives、player、ghosts 等 |
| 控制 | 方向键 / WASD |
| 得分 | 规则说明 |
| 胜负 | 清豆、撞幽灵、生命耗尽 |

**游戏专项**：若用户明确要求小游戏，`preview/index.html` 应包含可直接运行的规则、状态、控制与胜负反馈。

### 设计原因

1. **亮点 Demo**：一键建站任务链路 `website_builder → summary`，预览来自 `preview/index.html`。
2. **禁止空方案**：要求代码/结构/文件列表，不能只有需求分析。
3. **与工具输出对齐**：字段名与 `websiteBuilderTool` 返回结构一致。
4. **MVP 边界**：方案 + 片段 + 预览，不声称已部署完整仓库。

---

## 5. Summary Prompt

**文件**：`packages/prompts/src/summary.prompt.ts`  
**函数**：`buildSummaryPrompt(options)`

### 用途

在 Agent 任务完成后，基于 **Context**（用户任务、计划、工具输入输出、产物）生成结构化**中文执行总结**，供 `summary` 工具与前端 Chat 摘要展示。

对应 Claude Code 思想：**Execution Trace 闭环** — 用户能看到完整任务弧线。

### 输入

```typescript
buildSummaryPrompt({
  userGoal?: string,
  executedSteps?: Array<{ toolName: string; title?: string }>,
  artifactTypes?: string[],
})
```

| 参数 | 说明 |
|------|------|
| `userGoal` | 用户原始目标 |
| `executedSteps` | 已执行步骤与工具名 |
| `artifactTypes` | 如 `markdown`、`html` |

### 输出

总结提示字符串，要求 `summary` 字段包含 **五节**：

1. **任务目标** — 用户想完成什么  
2. **执行步骤** — 按时间顺序 3–5 步  
3. **调用工具** — 列出 `toolName` 及贡献  
4. **最终产物** — Markdown / HTML / 游戏方案等，如何在前端查看  
5. **下一步建议** — 2–4 条务实建议  

### 设计原因

1. **可追踪**：读者能从总结反推 Execution Timeline 发生了什么。
2. **工具结果优先**：禁止编造未执行的步骤或产物。
3. **演示收尾**：主线/亮点 Demo 最后一步均为 `summary`，统一收口。
4. **与 Context 对齐**：`summary` 工具读取 `context` 字符串，Prompt 规定解析方式。

---

## 使用示例

```typescript
import {
  buildSystemPrompt,
  buildPlannerPrompt,
  buildResearchPrompt,
  buildWebsitePrompt,
  buildSummaryPrompt,
} from '@agnes/prompts';

const toolDescriptions = registry
  .listTools()
  .map((t) => `- ${t.name}: ${t.description}`)
  .join('\n');

const system = buildSystemPrompt({
  agentType: 'research',
  toolDescriptions,
});

const plannerUser = buildPlannerPrompt({
  taskType: 'research',
  userInput: '调研 2026 年国内 AI Agent 产品发展趋势',
  availableTools: ['web_search', 'research_report', 'html_export', 'summary'],
});

const research = buildResearchPrompt({
  topic: '2026 年国内 AI Agent 产品发展趋势',
  sourceIds: ['S1', 'S2', 'S3'],
});

const website = buildWebsitePrompt({
  requirement: '随机生成一个有首屏和表单的品牌官网',
});

const summary = buildSummaryPrompt({
  userGoal: '调研 AI Agent 发展趋势',
  executedSteps: [
    { toolName: 'web_search', title: '检索相关资料' },
    { toolName: 'research_report', title: '生成调研报告' },
  ],
  artifactTypes: ['markdown', 'html'],
});
```

---

## 与 Claude Code Agent 思想的对应

| Claude Code 思想 | Prompt 体现 |
|------------------|-------------|
| QueryEngine 多轮循环 | `system` + `planner` 强调先计划、再逐步执行 |
| Tool.ts 标准工具 | `planner` 每步绑定 `toolName` |
| tools.ts 集中注册 | `system` 动态注入 `toolDescriptions` |
| Context 上下文累积 | `summary` 基于 context；`research` 只认 sources |
| Permission / Safety | `research` 禁止编造；`system` 声明密钥边界 |
| 可观测 | 结构化 JSON 计划 + 五节总结，便于 Trace 与 Preview |

---

## 设计原则

1. **提示词与代码分离** — 修改文案不改 Agent Core。  
2. **按任务类型组合** — research / website / summary 各用专用 Prompt。  
3. **工具名为唯一真相** — Planner 使用 `web_search` 等 snake_case。  
4. **中文用户场景** — 调研与总结默认中文，便于国内演示与评审。  
5. **Mock 与 LLM 双轨** — Mock 用模板保证 Demo；LLM 用 Prompt 保证灵活性。
