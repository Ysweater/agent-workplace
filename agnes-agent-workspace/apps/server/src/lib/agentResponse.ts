import type { AgentRunResult } from '@agnes/agent-core';

/** API-safe AgentRunResult — no secrets, full execution payload */
export function toAgentRunResponse(result: AgentRunResult) {
  return {
    runId: result.runId,
    status: result.status,
    task: result.context.task,
    plan: result.context.plan,
    toolCalls: result.context.toolCalls,
    finalResult: result.context.finalResult,
    context: result.context,
    trace: result.trace,
    artifacts: result.context.artifacts,
    createdAt: result.createdAt,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    error: result.error,
  };
}
