# Agnes Engineering Lineage

This note explains which parts of Agnes Agent Workspace are inspired by Claude Code, which parts follow Codex-style web interaction, and which parts use a Hardness-like engineering organization.

## Claude Code Inspiration

Agnes does not copy Claude Code source code. The borrowed ideas are architectural:

- QueryEngine-style execution loop: `AgentRuntime -> Planner -> Executor -> Tool`.
- Explicit Loop recorder: `AgentLoop` records perceive, route, plan, act, observe, reflect, persist, resume, and stop.
- Tool registry boundary: only registered tool names can be planned and executed.
- Context accumulation: each run records task, plan, tool calls, artifacts, trace events, and final result.
- Permission and degradation boundary: model keys stay on the server; missing providers degrade visibly.
- Recovery mindset: checkpoints record current node, completed nodes, pending nodes, and status.

## Codex-Style Web Interaction

The user experience borrows from web agent workspaces:

- A single composer supports continuing the same session rather than creating isolated tasks.
- The center panel shows user turns, immediate agent replies, and workflow run cards.
- The right artifact workspace separates preview, report, summary, files, and tool details.
- Model configuration lives near the composer because it affects the current task execution context.
- History is session-based; opening a history item restores all runs in that session.

## Hardness-Like Engineering Organization

The project is organized around hard boundaries rather than one large controller:

- `packages/agent-core`: runtime, planning, execution, context, trace, and checkpoint concepts.
- `packages/tools`: capability implementations with a stable `ToolDefinition` contract.
- `packages/prompts`: system, planner, research, website, summary, and related prompt builders.
- `apps/server`: API, storage, model provider, router, checkpoint, memory, and local site launching.
- `apps/web`: workbench UI, session history, model settings, artifact previews, and execution display.

This keeps product workflows extensible: adding a new tool should not require rewriting the runtime.

## Loop Engineering

Agnes uses a loop-engineering model similar in spirit to agent execution loops:

1. Perceive: load user input, session memory, and the model snapshot.
2. Route: the main agent classifies the task into a workflow intent.
3. Plan: the planner creates a registered-tool sequence and normalizes prompt optimization nodes.
4. Act: the executor advances one node at a time.
5. Observe: each node writes tool calls, artifacts, transitions, and trace events.
6. Reflect: the runtime marks the step as satisfied or resumable on failure.
7. Persist: the runtime stores completed and pending node ids.
8. Resume: failed or interrupted runs can restart from saved context and skip completed nodes.
9. Continue: follow-up user input keeps the same session id and passes recent conversation into planning and tools.

This is comparable to a lightweight LangGraph-style workflow: nodes are tools, edges are the planned order, state is the `AgentContext`, and checkpoint data provides resumability.

The detailed Claude Code loop reading notes and Agnes code mapping are in `docs/cc-loop-analysis.md`.

## Persistence And Cloud Readiness

Current persistence paths:

- JSON storage for local demos.
- PostgreSQL storage for shared/cloud deployments.
- Conversation memory for recent turns, now stored through the same `StorageAdapter` as sessions and reports.
- Redis checkpoint storage when `REDIS_URL` is configured, with in-memory fallback for local demos.
- Storage fallback: when conversation memory is missing, the server can reconstruct recent turns from saved session runs.

Recommended production extension:

- Use Redis for short-lived active session state and locks.
- Use PostgreSQL for durable sessions, conversations, reports, tool calls, checkpoints, and audit data.
- Keep generated media and site artifacts in object storage, with database rows storing metadata and URLs.

## Current Boundaries

- PPT generation currently returns structured slides, Markdown, and HTML deck preview; native `.pptx` export is a planned next step.
- Media generation depends on configured provider keys. When unavailable, Agnes now returns a visible prompt/status artifact rather than a blank result.
- Site/game generation uses a local Vite template for playable game previews; inline HTML fallback exists for quick preview continuity.
