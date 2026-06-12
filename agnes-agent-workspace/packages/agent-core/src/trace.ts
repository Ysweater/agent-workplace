import type { AgentContext, TraceEvent } from './types.js';

/** Build a chronological trace from serializable context state */
export function buildTrace(context: AgentContext, extra: TraceEvent[] = []): TraceEvent[] {
  const events: TraceEvent[] = [];

  for (const event of context.loopEvents ?? []) {
    events.push({
      id: crypto.randomUUID(),
      type: 'loop_event',
      timestamp: event.timestamp,
      data: {
        loop: event,
      },
    });
  }

  if (context.routeDecision) {
    events.push({
      id: crypto.randomUUID(),
      type: 'route',
      timestamp: context.task.createdAt,
      data: {
        routeDecision: context.routeDecision,
        modelSnapshot: context.modelSnapshot,
      },
    });
  }

  if (context.plan) {
    events.push({
      id: crypto.randomUUID(),
      type: 'plan',
      timestamp: context.plan.createdAt,
      data: {
        planId: context.plan.id,
        taskType: context.plan.taskType,
        steps: context.plan.steps.map((s) => ({
          id: s.id,
          title: s.title,
          toolName: s.toolName,
          status: s.status,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
        })),
      },
    });
  }

  for (const transition of context.stepTransitions) {
    const step = context.plan?.steps.find((s) => s.id === transition.stepId);
    events.push({
      id: crypto.randomUUID(),
      type: 'step_update',
      timestamp: transition.timestamp,
      data: {
        stepId: transition.stepId,
        title: transition.title,
        toolName: transition.toolName,
        status: transition.status,
        startedAt: step?.startedAt,
        completedAt: step?.completedAt,
      },
    });
  }

  for (const call of context.toolCalls) {
    events.push({
      id: crypto.randomUUID(),
      type: 'tool_call',
      timestamp: call.startedAt,
      data: {
        callId: call.id,
        stepId: call.stepId,
        toolName: call.toolName,
        input: call.input,
        startedAt: call.startedAt,
      },
    });

    if (call.completedAt) {
      events.push({
        id: crypto.randomUUID(),
        type: 'tool_result',
        timestamp: call.completedAt,
        data: {
          callId: call.id,
          stepId: call.stepId,
          toolName: call.toolName,
          success: call.success,
          output: call.output,
          error: call.error,
          startedAt: call.startedAt,
          completedAt: call.completedAt,
        },
      });
    }
  }

  for (const artifact of context.artifacts) {
    events.push({
      id: crypto.randomUUID(),
      type: 'artifact',
      timestamp: artifact.createdAt,
      data: { artifact },
    });
  }

  if (context.loopCheckpoint) {
    events.push({
      id: crypto.randomUUID(),
      type: 'checkpoint',
      timestamp: context.loopCheckpoint.updatedAt,
      data: { loopCheckpoint: context.loopCheckpoint },
    });
  }

  if (context.finalResult !== undefined) {
    events.push({
      id: crypto.randomUUID(),
      type: 'done',
      timestamp: new Date().toISOString(),
      data: { finalResult: context.finalResult },
    });
  }

  return [...events, ...extra].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

export function makeWarningEvent(
  message: string,
  data: Record<string, unknown> = {},
): TraceEvent {
  return {
    id: crypto.randomUUID(),
    type: 'warning',
    timestamp: new Date().toISOString(),
    data: { message, ...data },
  };
}

export function makeErrorEvent(message: string): TraceEvent {
  return {
    id: crypto.randomUUID(),
    type: 'error',
    timestamp: new Date().toISOString(),
    data: { message },
  };
}
