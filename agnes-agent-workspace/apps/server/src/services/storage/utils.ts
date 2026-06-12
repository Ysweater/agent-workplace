import type { ToolCallRecord } from '@agnes/agent-core';

export function extractToolCallsFromSession(data: unknown): ToolCallRecord[] {
  if (!data || typeof data !== 'object') return [];

  const record = data as Record<string, unknown>;

  if (Array.isArray(record.toolCalls)) {
    return record.toolCalls as ToolCallRecord[];
  }

  if (record.context && typeof record.context === 'object') {
    const ctx = record.context as Record<string, unknown>;
    if (Array.isArray(ctx.toolCalls)) {
      return ctx.toolCalls as ToolCallRecord[];
    }
  }

  return [];
}

export function extractSessionMeta(data: unknown): {
  userInput?: string;
  status?: string;
  taskType?: string;
  sessionId?: string;
  runId?: string;
  createdAt?: string;
  updatedAt?: string;
} {
  if (!data || typeof data !== 'object') return {};

  const record = data as Record<string, unknown>;
  const status = typeof record.status === 'string' ? record.status : undefined;
  const runId = typeof record.runId === 'string' ? record.runId : undefined;
  const sessionId = typeof record.sessionId === 'string' ? record.sessionId : undefined;
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : undefined;
  const completedAt = typeof record.completedAt === 'string' ? record.completedAt : undefined;

  const task =
    record.task && typeof record.task === 'object'
      ? (record.task as Record<string, unknown>)
      : null;

  const context =
    record.context && typeof record.context === 'object'
      ? (record.context as Record<string, unknown>)
      : null;

  const contextTask =
    context?.task && typeof context.task === 'object'
      ? (context.task as Record<string, unknown>)
      : null;

  const userInput =
    (typeof task?.userInput === 'string' ? task.userInput : undefined) ??
    (typeof contextTask?.userInput === 'string' ? contextTask.userInput : undefined);

  const taskType =
    (typeof task?.taskType === 'string' ? task.taskType : undefined) ??
    (typeof contextTask?.taskType === 'string' ? contextTask.taskType : undefined);

  const contextSessionId =
    context && typeof context.sessionId === 'string' ? context.sessionId : undefined;
  const taskCreatedAt =
    typeof task?.createdAt === 'string'
      ? task.createdAt
      : typeof contextTask?.createdAt === 'string'
        ? contextTask.createdAt
        : undefined;

  return {
    userInput,
    status,
    taskType,
    sessionId: sessionId ?? contextSessionId,
    runId,
    createdAt: createdAt ?? taskCreatedAt,
    updatedAt: completedAt ?? createdAt ?? taskCreatedAt,
  };
}
