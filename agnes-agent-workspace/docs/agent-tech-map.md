# Agnes Agent Workspace: AI Agent Technical Map

This project does not copy Claude Code source code. It independently implements a TypeScript Web Agent prototype while learning from Claude Code's agent architecture, Codex-style workspace interaction, LangGraph-style node execution, and Hardness-style engineering boundaries.

## Code Mapping

| File | Agent technique | Similar product / architecture | How it is implemented here |
| --- | --- | --- | --- |
| `packages/agent-core/src/AgentLoop.ts` | Explicit loop recorder | Claude Code QueryEngine loop / Ralph Loop / LangGraph state events | Records perceive, route, plan, act, observe, reflect, persist, resume, and stop events into `context.loopEvents` and `trace[type="loop_event"]`. |
| `packages/agent-core/src/AgentRuntime.ts` | Main agent orchestration, run entry, loop checkpoint | Claude Code QueryEngine / LangGraph graph runner | Converts user input into a task, receives route and model snapshots, creates a plan, drives the executor, and records loop state. |
| `packages/agent-core/src/Planner.ts` | Intent classification, tool-chain planning, fallback plan | Claude Code planner / LangGraph conditional edge | Builds plans for research, website, presentation, media, writing, analysis, and summary tasks. |
| `packages/agent-core/src/Executor.ts` | Tool execution loop, prompt-optimized node input adaptation, step status updates | Claude Code tool-use loop / LangGraph node execution | Executes plan steps in order, passes upstream outputs to downstream tools, writes step outputs/tool calls/artifacts, and ensures generation tools consume `prompt_enhancer.enhancedPrompt`. |
| `packages/agent-core/src/ContextManager.ts` | Runtime context, trace source, checkpoint state | Claude Code Context / LangGraph state | Stores task, plan, tool calls, artifacts, route decision, model snapshot, loop events, and loop checkpoint. |
| `packages/agent-core/src/ToolRegistry.ts` | Tool allowlist and capability registry | Claude Code tools abstraction | Tools must be registered before Planner / Executor can use them. Unknown tools are skipped with warnings. |
| `apps/server/src/services/workflowRouter.service.ts` | Main-agent routing strategy | LangGraph router / Copilot agent router | Uses explicit task type and keyword signals to select a workflow and produce an explainable routeDecision. |
| `apps/server/src/services/checkpoint.service.ts` | Redis / memory checkpoint | LangGraph checkpoint saver | Saves run status, current node, completed nodes, and pending nodes. `REDIS_URL` enables cloud Redis storage. |
| `apps/server/src/services/modelProvider.service.ts` | Multi-model provider, model snapshot, model-switch isolation | Codex / Claude model settings | Captures a ModelRunSnapshot per run. Switching model in UI affects the next run, not the current one. |
| `apps/server/src/services/sessionModelPreference.service.ts` | Session-level model preference | Claude Code settings / Codex conversation settings | Persists model preference by `sessionId` in JSON/PostgreSQL storage, then freezes it into `ModelRunSnapshot` when a run starts. |
| `apps/server/src/controllers/agent.controller.ts` | Immediate response plus background execution | Claude Code task runner / Codex background task | `/run-async` returns immediateReply and runId first, then runs workflow in the background while the frontend polls status. |
| `apps/server/src/lib/agentSetup.ts` | Runtime assembly and service injection | Hardness dependency boundary | Injects LLM, search, site, and media services at the server layer. `agent-core` does not depend on HTTP or cloud services. |
| `packages/tools/src/promptEnhancerTool.ts` | Prompt optimization before all generation workflows | Claude Code planning discipline / Midjourney / Runway prompt assistant | Expands raw user wording into a structured production brief for research, website, writing, analysis, presentation, image, and video generation. |
| `packages/tools/src/mediaGeneratorTools.ts` | Image / video generation node | AIGC workflow node | Consumes enhanced prompts and calls media generation services, with explainable fallback when services are unavailable. |
| `packages/tools/src/presentationGeneratorTool.ts` | Structured slide generation | Gamma / Tome / Manus artifact | Generates slide JSON, Markdown outline, and HTML deck preview. |
| `packages/tools/src/webSearchTool.ts` | Search abstraction | Perplexity / Deep Research | Returns numbered sources for downstream report generation. |
| `packages/tools/src/researchReportTool.ts` | Source-grounded report writing | Deep Research report writer | Generates Markdown reports based on sources and avoids unsupported conclusions. |
| `apps/web/src/pages/WorkspacePage.tsx` | Codex-style workspace layout | Codex Web / Claude Artifacts | Left task list, center execution area, right artifact workspace with resize and hide controls. |
| `apps/web/src/components/ArtifactWorkspace.tsx` | Artifact workspace | Claude Artifacts / Codex preview pane | Supports Preview, Markdown, Files, and Trace views. |
| `apps/web/src/components/ExecutionDetails.tsx` | Observable trace | Claude Code execution trace | Shows plan, tool calls, inputs, outputs, and event stream for demo explanation. |

## Loop Engineering

The runtime treats every complex request as an observable and recoverable agent loop:

1. `Perceive`: load user input, session memory, and model snapshot.
2. `Route`: the main agent detects intent and selects a workflow.
3. `Plan`: the planner creates executable nodes and normalizes required prompt optimization steps.
4. `Act`: the executor calls tools node by node.
5. `Observe`: the context manager records steps, tool calls, artifacts, and trace events.
6. `Reflect`: the runtime marks each step as satisfied or resumable on failure.
7. `Persist`: the checkpoint stores current, completed, and pending nodes for resume.
8. `Resume/Stop`: failed runs can continue from saved state; completed runs close the loop.

This is not a React rendering loop. It is an agent task loop closer to Claude Code QueryEngine and LangGraph graph state.

## Model Switching Rule

Running tasks are not interrupted by model changes in the UI. At the start of each run, the backend captures a `ModelRunSnapshot`.

- The current run uses that snapshot until it finishes.
- UI model changes affect only the next new run.
- To regenerate with a new model, submit a new task or resume explicitly.

This keeps every Agent Run reproducible and avoids mixing two models in the same execution.

## Current Boundaries

- Redis resume: `checkpoint.service.ts` supports memory and Redis. `POST /api/agent/runs/:runId/resume` can continue failed runs and skip successful steps.
- Session memory: `conversationMemory.service.ts` persists recent turns by `sessionId` and injects them into chat and planning paths.
- PPT: current output is structured slides plus HTML deck preview. PPTX export can be added next.
- Image / video AIGC: the tool chain exists; real generation depends on media service credentials and provider availability.
