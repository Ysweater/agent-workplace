# Claude Code Loop Analysis And Agnes Adaptation

## 结论先行

Claude Code 源码最值得学习的地方不是某个单独工具，而是它把 Agent 做成了一个可持续推进、可观察、可恢复的执行系统。它的核心价值可以概括为：

```text
Perceive -> Route -> Plan -> Act -> Observe -> Reflect -> Persist -> Resume/Stop
```

Agnes 没有直接复制 Claude Code 源码。原因有三点：

1. Claude Code 快照是研究资料，直接复制会带来许可、维护和适配风险。
2. Agnes 是 Web 工作台，执行环境、UI、持久化和产物预览都不同。
3. 我们真正需要的是工程思想：Loop、Tool、Context、Checkpoint、Memory，而不是照搬实现细节。

本项目已经把这套思想封装为自己的 `AgentLoop` + `AgentRuntime` + `Planner` + `Executor` + `ContextManager`。

## CC 源码好在哪里

| CC 源码/架构位置 | 好在哪里 | Agnes 的吸收方式 |
| --- | --- | --- |
| `claude-code-readable-2/src/QueryEngine.ts` | 把一次用户请求变成多轮执行循环，模型不只是回答，而是持续判断下一步动作 | `packages/agent-core/src/AgentRuntime.ts` 驱动 run 生命周期；`AgentLoop.ts` 记录显式 loop 阶段 |
| `src/Tool.ts`, `src/tools.ts`, `src/tools/*` | 工具是注册、受控、可审计的能力边界，避免模型自由调用任意动作 | `ToolDefinition` + `ToolRegistry`；Planner 输出的 toolName 必须已注册 |
| `src/context.ts`, `src/utils/systemPrompt.ts` | 上下文不是简单聊天记录，而是任务、系统提示、工具结果、环境状态的组合 | `AgentContext` 保存 task、plan、toolCalls、artifacts、modelSnapshot、loopEvents、loopCheckpoint |
| `src/tools/AgentTool/*` | 主 Agent 可以把复杂任务交给子 Agent/工作流，不是所有事情都在单一 prompt 中完成 | `workflowRouter.service.ts` 先路由到 research/website/presentation/media 等 workflow |
| `src/memdir/*`, `src/services/extractMemories/*` | 记忆需要被抽取、检索和复用，而不是无限拼接历史 | `conversationMemory.service.ts` 保存单会话最近 turns，并在 Planner/工具输入中注入 |
| 权限、设置、模型相关模块 | 模型、工具、权限、密钥要由系统层控制，不能交给模型随意决定 | `modelProvider.service.ts` 捕获 `ModelRunSnapshot`；密钥只在 server 读取；工具白名单执行 |

## Agnes 中的 Loop 封装

新增核心文件：

```text
packages/agent-core/src/AgentLoop.ts
packages/agent-core/src/AgentRuntime.ts
packages/agent-core/src/Executor.ts
packages/agent-core/src/ContextManager.ts
packages/agent-core/src/trace.ts
```

运行时每个复杂任务都会记录这些阶段：

| 阶段 | 说明 | 代码位置 |
| --- | --- | --- |
| `perceive` | 加载用户输入、session memory、模型快照 | `AgentRuntime.runFresh` |
| `route` | 主 Agent 接收 server 层 routeDecision 并记录解释 | `AgentRuntime.runFresh` |
| `plan` | Planner 生成 workflow tool nodes | `AgentRuntime.runFresh`, `Planner.ts` |
| `act` | Executor 调用当前工具节点 | `Executor.executeStep` |
| `observe` | 记录工具输出、artifact、step transition | `Executor.executeStep` |
| `reflect` | 判断步骤是否满足预期，失败时留下 resume 信息 | `Executor.executeStep`, `AgentRuntime.finalizeRun/failRun` |
| `persist` | 写入 loopCheckpoint，支持恢复 | `AgentRuntime`, `checkpoint.service.ts` |
| `resume` | 从保存的 AgentContext 跳过成功步骤继续 | `AgentRuntime.resumeFromContext` |
| `stop` | 完成或失败停止，Trace 中可见 | `AgentRuntime.finalizeRun/failRun` |

这些事件会写入：

```ts
context.loopEvents
trace[type="loop_event"]
```

因此前端和验收脚本可以验证 Loop Engineering 是否真实存在，而不是文档概念。

## Prompt Optimizer 规则

Agnes 的五大生产工作流都不允许把用户原话直接丢给生成工具：

| 工作流 | 优化节点 | 下游使用方式 |
| --- | --- | --- |
| 检索分析报告 | `prompt_enhancer` | `research_report.input.topic = enhancedPrompt` |
| 一键建站 | `prompt_enhancer` | `website_builder.input.requirement = enhancedPrompt` |
| 写作/分析 | `prompt_enhancer` | `document_generator.input.task = enhancedPrompt` |
| PPT 生成 | `prompt_enhancer` | `presentation_generator.input.task = enhancedPrompt` |
| 图片/视频 AIGC | `prompt_enhancer` | `image_generator/video_generator.input.prompt = enhancedPrompt` |

`Planner.normalizePlanForTaskType` 还有一层保护：真实模型规划时如果漏掉 `prompt_enhancer`，系统会自动补在生成工具之前。

## 模型切换结论

Agnes 的模型切换行为是快照式：

```text
当前 run 启动 -> captureModelSnapshot()
运行中用户切换模型 -> 不影响当前 run
当前 run 继续使用旧 snapshot
下一次新 run 或 resume -> 使用新的模型配置
```

明确结论：运行中切换模型不会中断当前任务，也不会让当前任务中途换模型；它只影响下一次 run。若通过 resume 重启失败任务，会捕获新的 snapshot 继续执行未完成步骤。

## 个人理解

Claude Code 的强点不是“会调用工具”，而是它把不可靠的模型输出包进了可靠的工程循环：

- 模型负责提出意图和计划。
- 系统负责校验工具、执行动作、记录状态。
- 上下文是单一事实来源。
- 每一步都可以被观察、恢复和解释。

Agnes 的实现目标也是这个方向：Web UI 只是入口，真正的产品能力在可解释的 Agent Loop、Workflow Router、Memory、Prompt Optimizer 和 Checkpoint。
