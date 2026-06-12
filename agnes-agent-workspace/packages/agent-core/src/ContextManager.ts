import type {
  AgentContext,
  AgentLoopEvent,
  AgentLoopStage,
  AgentLoopStatus,
  AgentPlan,
  AgentStepStatus,
  Artifact,
  ConversationTurn,
  LoopCheckpoint,
  ModelSnapshot,
  RouteDecision,
  StepTransition,
  ToolCallRecord,
} from './types.js';
import type { AgentTaskType } from './types.js';

/**
 * Context manager (Context思想).
 * Holds user input, plan, tool results, and final output — all JSON-serializable.
 */
export class ContextManager {
  private context: AgentContext;

  static createContext(
    userInput: string,
    taskType: AgentTaskType,
    options: {
      routeDecision?: RouteDecision;
      modelSnapshot?: ModelSnapshot;
      sessionId?: string;
      conversationHistory?: ConversationTurn[];
    } = {},
  ): AgentContext {
    const task = {
      id: crypto.randomUUID(),
      userInput,
      taskType,
      createdAt: new Date().toISOString(),
    };

    return {
      task,
      ...(options.sessionId ? { sessionId: options.sessionId } : {}),
      ...(options.conversationHistory?.length
        ? { conversationHistory: structuredClone(options.conversationHistory) }
        : {}),
      ...(options.routeDecision ? { routeDecision: options.routeDecision } : {}),
      ...(options.modelSnapshot ? { modelSnapshot: options.modelSnapshot } : {}),
      loopEvents: [],
      plan: null,
      toolCalls: [],
      stepOutputs: {},
      stepTransitions: [],
      artifacts: [],
    };
  }

  setLoopCheckpoint(checkpoint: LoopCheckpoint): void {
    this.context.loopCheckpoint = structuredClone(checkpoint);
  }

  constructor(context: AgentContext) {
    this.context = structuredClone(context);
  }

  getContext(): AgentContext {
    return structuredClone(this.context);
  }

  addPlan(plan: AgentPlan): void {
    this.context.plan = structuredClone(plan);
    const timestamp = plan.createdAt;
    for (const step of plan.steps) {
      this.recordStepTransition(step.id, step.title, step.toolName, step.status, timestamp);
    }
  }

  updateStepStatus(stepId: string, status: AgentStepStatus): string {
    const timestamp = new Date().toISOString();
    if (!this.context.plan) return timestamp;

    const step = this.context.plan.steps.find((s) => s.id === stepId);
    if (!step) return timestamp;

    step.status = status;
    if (status === 'running') step.startedAt = timestamp;
    if (status === 'success' || status === 'error') step.completedAt = timestamp;

    this.recordStepTransition(stepId, step.title, step.toolName, status, timestamp);
    return timestamp;
  }

  private recordStepTransition(
    stepId: string,
    title: string,
    toolName: string,
    status: AgentStepStatus,
    timestamp: string,
  ): void {
    const transition: StepTransition = { stepId, title, toolName, status, timestamp };
    this.context.stepTransitions.push(transition);
  }

  addToolCall(record: ToolCallRecord): void {
    this.context.toolCalls.push(structuredClone(record));
  }

  updateToolCall(
    callId: string,
    patch: Partial<Pick<ToolCallRecord, 'output' | 'success' | 'error' | 'completedAt'>>,
  ): void {
    const record = this.context.toolCalls.find((c) => c.id === callId);
    if (!record) return;
    Object.assign(record, patch);
  }

  addLoopEvent(input: {
    stage: AgentLoopStage;
    status: AgentLoopStatus;
    message: string;
    data?: Record<string, unknown>;
  }): AgentLoopEvent {
    if (!this.context.loopEvents) {
      this.context.loopEvents = [];
    }
    const event: AgentLoopEvent = {
      id: crypto.randomUUID(),
      stage: input.stage,
      status: input.status,
      message: input.message,
      timestamp: new Date().toISOString(),
      ...(input.data ? { data: structuredClone(input.data) } : {}),
    };
    this.context.loopEvents.push(event);
    return structuredClone(event);
  }

  setStepOutput(stepId: string, output: unknown): void {
    this.context.stepOutputs[stepId] = output;
  }

  addArtifact(artifact: Artifact): void {
    this.context.artifacts.push(structuredClone(artifact));
  }

  setFinalResult(result: unknown): void {
    this.context.finalResult = result;
  }

  getMutableContext(): AgentContext {
    return this.context;
  }
}
