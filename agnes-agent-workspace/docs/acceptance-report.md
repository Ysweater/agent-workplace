# Agnes Agent Workspace 验收报告

生成时间：2026-06-12

## 结论

当前项目已经具备 Agnes Agent Workspace 的核心闭环：主 Agent 快速响应、后台 Workflow 路由、五类任务能力、提示词增强、会话记忆、持久化存储、checkpoint/resume、模型快照和可观测 Loop 执行。

自动化验收脚本：`scripts/architecture-acceptance.mjs`

最近一次结果文件：`acceptance-result.json`

## 逐项验证

| 验收项 | 结论 | 证据 |
| --- | --- | --- |
| 主 Agent 先快速回复用户，后台路由工作流 | 通过 | `POST /api/agent/run-async` 先返回 HTTP 202、`status=running`、`immediateReply`，初始 `toolCalls=[]`；随后轮询 run 完成 |
| 正常对话 | 通过 | 普通问题进入直接 chat 响应，`context.finalResult.mode=chat`，不调用工具 |
| 检索分析报告 | 通过 | 工具链：`prompt_enhancer -> web_search -> research_report -> html_export -> summary`；`research_report.input.topic` 使用增强后的 brief，产出 Markdown/HTML artifact |
| 一键建站 | 通过 | 工具链：`prompt_enhancer -> website_builder -> summary`；`website_builder.input.requirement` 使用增强后的建站 brief，产出 HTML preview artifact |
| PPT 生成 | 通过 | 工具链：`prompt_enhancer -> presentation_generator -> summary`；`presentation_generator.input.task` 使用增强后的演示 brief，产出 slides/Markdown/HTML deck |
| 图片 AIGC | 通过 | 工具链：`prompt_enhancer -> image_generator -> summary`；`image_generator.input.prompt` 等于增强后的 prompt，不等于用户原话 |
| 视频 AIGC | 通过 | 工具链：`prompt_enhancer -> video_generator -> summary`；视频生成同样强制使用增强 prompt |
| 记忆持久化 + 上下文衔接 | 通过 | 同一 `sessionId` 下连续两次 run，后续 run 的 `conversationHistory.length=2`，`GET /api/agent/sessions/:sessionId` 返回多 run |
| 云端记忆/存储能力 | 通过实现，当前本地演示为 JSON | `StorageAdapter` 已统一支持 sessions、reports、tool_calls、conversations；`STORAGE_DRIVER=postgres` + `DATABASE_URL` 时写入 PostgreSQL，失败自动降级 JSON |
| 断点续传 | 通过实现 | `loopCheckpoint` 保存当前节点、已完成节点、待执行节点；`POST /api/agent/runs/:runId/resume` 从保存 context 跳过成功步骤继续执行 |
| 路由策略清晰可解释 | 通过 | `workflowRouter.service.ts` 输出 `intent`、`workflowName`、`confidence`、`signals`、`reason` |
| 模型切换行为 | 通过 | 实测结论：当前任务不会中断，也不会切换到新模型；任务启动时捕获 `ModelRunSnapshot`，后续 Planner/Tools 均使用该快照；新模型只影响下一次 run |
| Loop Engineering | 通过 | `AgentLoop -> AgentRuntime -> Planner -> Executor -> ContextManager` 构成显式决策循环；`context.loopEvents` 与 `trace[type=loop_event]` 记录 perceive/route/plan/act/observe/reflect/persist/resume/stop |

## 模型切换实测结论

测试步骤：

1. 将运行时模型设置为 `custom / before-switch-model`。
2. 发起 `run-async` 建站任务。
3. 在任务运行中立即切换为 `mock / after-switch-model`。
4. 轮询任务完成后检查 `context.modelSnapshot`。

结果：

```json
{
  "provider": "custom",
  "model": "before-switch-model",
  "baseUrl": "http://127.0.0.1:9/v1",
  "configured": true
}
```

明确结论：模型切换不会中断当前生成；当前 run 继续使用启动瞬间的模型快照。新选择的模型只影响之后创建的 run。

## 关键代码位置

| 技术点 | 代码位置 | 产品/架构类比 |
| --- | --- | --- |
| 主 Agent 快速回复 + 后台执行 | `apps/server/src/controllers/agent.controller.ts` | 类似 Codex 先给状态反馈，再继续执行任务 |
| Workflow 路由 | `apps/server/src/services/workflowRouter.service.ts` | 类似 Claude Code/Codex 的任务意图分流 |
| Planner | `packages/agent-core/src/Planner.ts` | 类似 Claude Code QueryEngine 前的计划生成 |
| Loop 执行 | `packages/agent-core/src/AgentLoop.ts`, `packages/agent-core/src/AgentRuntime.ts`, `packages/agent-core/src/Executor.ts` | 类似 ReAct 的 perceive-route-plan-act-observe-reflect-persist 升级版 |
| Context/Checkpoint | `packages/agent-core/src/ContextManager.ts`, `apps/server/src/services/checkpoint.service.ts` | 类似 LangGraph state/checkpoint |
| 工具注册与调用 | `packages/agent-core/src/ToolRegistry.ts`, `packages/tools/src/index.ts` | 类似 Codex tool use / function calling |
| Prompt 优化 | `packages/tools/src/promptEnhancerTool.ts`, `packages/agent-core/src/Planner.ts`, `packages/agent-core/src/Executor.ts` | 类似专业 Agent 工作流中的 prompt engineer 前置节点；不让五大生产工作流直通用户原话 |
| 模型快照 | `apps/server/src/services/modelProvider.service.ts` | 类似每个 run 固定 runtime config，避免执行中漂移 |
| 云端可切换存储 | `apps/server/src/services/storage/*` | Hardness-like adapter/fallback 工程组织 |

## 验证命令

```bash
npm run build
node scripts/architecture-acceptance.mjs
```

运行脚本前需要后端服务可访问：`http://localhost:3001`。
