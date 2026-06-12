import type { ContextManager } from './ContextManager.js';
import type { AgentLoopEvent, AgentLoopStage, AgentLoopStatus } from './types.js';

/**
 * Small, explicit loop recorder inspired by Claude Code's QueryEngine shape:
 * perceive -> route -> plan -> act -> observe -> reflect -> persist/resume.
 *
 * The runtime owns decisions; this class only records the engineering loop so
 * UI, checkpoints, and docs can explain why each step happened.
 */
export class AgentLoop {
  constructor(private contextManager: ContextManager) {}

  record(
    stage: AgentLoopStage,
    status: AgentLoopStatus,
    message: string,
    data: Record<string, unknown> = {},
  ): AgentLoopEvent {
    return this.contextManager.addLoopEvent({
      stage,
      status,
      message,
      data,
    });
  }
}
