import { ContextManager } from './ContextManager.js';
import { Executor } from './Executor.js';
import { classifyTaskType, Planner } from './Planner.js';
import { buildTrace, makeErrorEvent, makeWarningEvent } from './trace.js';
import { ToolRegistry } from './ToolRegistry.js';
import type {
  AgentContext,
  AgentPlan,
  AgentRunOptions,
  AgentRunResult,
  AgentStep,
  LLMProvider,
  PlanningOptions,
  ToolExecutionServices,
  TraceEvent,
} from './types.js';

export interface AgentRuntimeOptions {
  registry: ToolRegistry;
  llm?: LLMProvider;
  planning?: PlanningOptions;
  services?: ToolExecutionServices;
}

interface PlanValidation {
  plan: AgentPlan;
  executableSteps: AgentStep[];
  warnings: TraceEvent[];
}

/**
 * AgentRuntime is inspired by Claude Code's QueryEngine idea.
 * It orchestrates Context -> Plan -> Execute loop -> Final Result.
 */
export class AgentRuntime {
  private planner: Planner;
  private executor: Executor;

  constructor(private options: AgentRuntimeOptions) {
    this.planner = new Planner({ llm: options.llm, planning: options.planning });
    this.executor = new Executor(options.registry, options.services);
  }

  async run(userInput: string, options: AgentRunOptions = {}): Promise<AgentRunResult> {
    if (options.resumeContext) {
      return this.resumeFromContext(options.resumeContext, options);
    }
    return this.runFresh(userInput, options);
  }

  private async runFresh(userInput: string, options: AgentRunOptions): Promise<AgentRunResult> {
    const runId = options.runId ?? crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const startMs = Date.now();
    const taskType = options.taskTypeHint ?? classifyTaskType(userInput);

    const baseContext = ContextManager.createContext(userInput.trim(), taskType, {
      routeDecision: options.routeDecision,
      modelSnapshot: options.modelSnapshot,
      sessionId: options.sessionId,
      conversationHistory: options.conversationHistory,
    });
    const contextManager = new ContextManager(baseContext);
    const runtimeWarnings: TraceEvent[] = [];

    try {
      const availableTools = this.options.registry.listTools();
      const rawPlan = await this.planner.createPlan(
        userInput.trim(),
        availableTools,
        taskType,
        options.conversationHistory,
      );
      const validation = this.validatePlan(rawPlan);

      runtimeWarnings.push(...validation.warnings);
      contextManager.addPlan(validation.plan);

      if (validation.executableSteps.length === 0) {
        const message = 'No executable steps: all planned tools are missing from registry';
        const completedAt = new Date().toISOString();
        return {
          runId,
          status: 'failed',
          context: contextManager.getContext(),
          trace: buildTrace(contextManager.getContext(), [
            ...runtimeWarnings,
            makeErrorEvent(message),
          ]),
          createdAt,
          completedAt,
          durationMs: Date.now() - startMs,
          error: message,
        };
      }

      const executablePlan: AgentPlan = {
        ...validation.plan,
        steps: validation.executableSteps,
      };

      contextManager.setLoopCheckpoint({
        runId,
        workflowName: options.routeDecision?.workflowName ?? `${taskType}Workflow`,
        currentNodeId: executablePlan.steps[0]?.id,
        completedNodeIds: [],
        pendingNodeIds: executablePlan.steps.map((step) => step.id),
        status: 'running',
        updatedAt: new Date().toISOString(),
      });

      await this.executor.executePlan(executablePlan, contextManager);

      return this.finalizeRun(runId, createdAt, startMs, contextManager, executablePlan, runtimeWarnings);
    } catch (err) {
      return this.failRun(runId, createdAt, startMs, contextManager, runtimeWarnings, err);
    }
  }

  /** Resume from saved context; skips steps already marked success. */
  private async resumeFromContext(
    existingContext: AgentContext,
    options: AgentRunOptions,
  ): Promise<AgentRunResult> {
    const runId = options.runId ?? existingContext.loopCheckpoint?.runId ?? crypto.randomUUID();
    const createdAt = existingContext.task.createdAt;
    const startMs = Date.now();
    const contextManager = new ContextManager(existingContext);
    const runtimeWarnings: TraceEvent[] = [
      makeWarningEvent('Resuming run from checkpoint', {
        runId,
        pending: existingContext.loopCheckpoint?.pendingNodeIds ?? [],
      }),
    ];

    const plan = existingContext.plan;
    if (!plan) {
      return {
        runId,
        status: 'failed',
        context: contextManager.getContext(),
        trace: buildTrace(contextManager.getContext(), [
          ...runtimeWarnings,
          makeErrorEvent('Cannot resume: no plan in saved context'),
        ]),
        createdAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startMs,
        error: 'Cannot resume: no plan in saved context',
      };
    }

    for (const step of plan.steps) {
      if (step.status === 'error') {
        step.status = 'pending';
        delete step.startedAt;
        delete step.completedAt;
      }
    }

    const pendingIds = plan.steps.filter((s) => s.status !== 'success').map((s) => s.id);
    contextManager.setLoopCheckpoint({
      runId,
      workflowName:
        existingContext.loopCheckpoint?.workflowName ??
        options.routeDecision?.workflowName ??
        `${plan.taskType}Workflow`,
      currentNodeId: pendingIds[0],
      completedNodeIds: plan.steps.filter((s) => s.status === 'success').map((s) => s.id),
      pendingNodeIds: pendingIds,
      status: 'running',
      updatedAt: new Date().toISOString(),
    });

    try {
      await this.executor.executePlan(plan, contextManager, { skipCompleted: true });
      return this.finalizeRun(runId, createdAt, startMs, contextManager, plan, runtimeWarnings);
    } catch (err) {
      return this.failRun(runId, createdAt, startMs, contextManager, runtimeWarnings, err);
    }
  }

  private finalizeRun(
    runId: string,
    createdAt: string,
    startMs: number,
    contextManager: ContextManager,
    executablePlan: AgentPlan,
    runtimeWarnings: TraceEvent[],
  ): AgentRunResult {
    const ctx = contextManager.getContext();
    const finalResult = {
      taskType: ctx.task.taskType,
      artifacts: ctx.artifacts,
      summary: ctx.stepOutputs[executablePlan.steps.at(-1)?.id ?? ''] ?? null,
      toolCallCount: ctx.toolCalls.length,
    };

    contextManager.setFinalResult(finalResult);
    contextManager.setLoopCheckpoint({
      runId,
      workflowName: ctx.loopCheckpoint?.workflowName ?? `${executablePlan.taskType}Workflow`,
      completedNodeIds: executablePlan.steps.map((step) => step.id),
      pendingNodeIds: [],
      status: 'completed',
      updatedAt: new Date().toISOString(),
    });

    const completedAt = new Date().toISOString();
    const finalContext = contextManager.getContext();

    return {
      runId,
      status: 'completed',
      context: finalContext,
      trace: buildTrace(finalContext, runtimeWarnings),
      createdAt,
      completedAt,
      durationMs: Date.now() - startMs,
    };
  }

  private failRun(
    runId: string,
    createdAt: string,
    startMs: number,
    contextManager: ContextManager,
    runtimeWarnings: TraceEvent[],
    err: unknown,
  ): AgentRunResult {
    const message = err instanceof Error ? err.message : 'Agent run failed';
    const completedAt = new Date().toISOString();
    const failedContext = contextManager.getContext();
    const completedIds =
      failedContext.plan?.steps.filter((s) => s.status === 'success').map((s) => s.id) ?? [];
    const pendingIds =
      failedContext.plan?.steps.filter((s) => s.status !== 'success').map((s) => s.id) ?? [];

    contextManager.setLoopCheckpoint({
      runId,
      workflowName: failedContext.loopCheckpoint?.workflowName ?? 'unknownWorkflow',
      currentNodeId: pendingIds[0],
      completedNodeIds: completedIds,
      pendingNodeIds: pendingIds,
      status: 'failed',
      updatedAt: completedAt,
    });

    return {
      runId,
      status: 'failed',
      context: contextManager.getContext(),
      trace: buildTrace(contextManager.getContext(), [...runtimeWarnings, makeErrorEvent(message)]),
      createdAt,
      completedAt,
      durationMs: Date.now() - startMs,
      error: message,
    };
  }

  private validatePlan(plan: AgentPlan): PlanValidation {
    const warnings: TraceEvent[] = [];
    const steps = plan.steps.map((step) => ({ ...step }));

    const executableSteps: AgentStep[] = [];

    for (const step of steps) {
      if (!this.options.registry.hasTool(step.toolName)) {
        step.status = 'error';
        step.completedAt = new Date().toISOString();
        warnings.push(
          makeWarningEvent(`Unknown tool "${step.toolName}" - step skipped`, {
            stepId: step.id,
            toolName: step.toolName,
            title: step.title,
          }),
        );
        continue;
      }
      executableSteps.push(step);
    }

    return {
      plan: { ...plan, steps },
      executableSteps,
      warnings,
    };
  }
}

export { ContextManager, Executor, Planner, ToolRegistry };
export { buildTrace } from './trace.js';
export { classifyTaskType } from './Planner.js';
