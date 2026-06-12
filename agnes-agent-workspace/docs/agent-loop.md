# Agent Loop Architecture

Agnes now exposes the Agent loop as a first-class product concept instead of hiding it inside the HTTP controller.

## Runtime Shape

```text
MainAgent
  -> Memory
  -> ContextComposer
  -> WorkflowRouter
  -> PromptOptimizer
  -> AgentLoop
  -> WorkflowRegistry
  -> ToolExecutor
  -> Observer
  -> Checkpoint
  -> Presenter
```

## Server Files

| Layer | File | Responsibility |
| --- | --- | --- |
| Main Agent | `apps/server/src/agent/main-agent.ts` | Prepares a run by loading memory, routing workflow, composing context, selecting model snapshot, and preparing prompt optimization metadata. |
| Memory | `apps/server/src/agent/memory.ts` | Loads recent turns and historical runs; reconstructs turns from saved runs if conversation memory is missing. |
| Context Composer | `apps/server/src/agent/context-composer.ts` | Builds `currentGoal`, `recentTurns`, `sessionSummary`, `relevantArtifacts`, `lastWorkflow`, `modelSnapshot`, `constraints`. |
| Router | `apps/server/src/agent/router.ts` | Routes by explicit type, user intent, history, and workflow registry. |
| Prompt Optimizer | `apps/server/src/agent/prompt-optimizer.ts` | Exposes workflow prompt optimization policy before tool execution. |
| Workflow Registry | `apps/server/src/agent/workflow-registry.ts` | Registers chat, research, website, PPT, media, writing, and analysis workflows as first-class objects. |
| Presenter | `apps/server/src/agent/presenter.ts` | Builds API response with `agentArchitecture` metadata for frontend display. |

## Loop Stages

The core loop events are persisted in `context.loopEvents` and rendered in the frontend Tool tab:

```text
Perceive -> Route -> Plan -> Act -> Observe -> Reflect -> Persist -> Stop
```

`prompt_enhancer` calls are rendered as a separate `Prompt Optimize` node so reviewers can verify that production workflows do not pass raw user wording directly to generators.

## Model Snapshot Rule

- `.env` is the global default.
- Session model preference is persisted by `sessionId`.
- A new run freezes the selected model into `ModelRunSnapshot`.
- A running step chain is not mutated by UI model switching.
- Failed/pending work can be resumed with the latest session model preference while completed steps are skipped.
