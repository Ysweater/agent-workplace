import type { AgentRunResult } from '@agnes/agent-core';
import { toAgentRunResponse } from '../lib/agentResponse.js';
import type { ComposedAgentContext } from './context-composer.js';
import type { PromptOptimizationPlan } from './prompt-optimizer.js';
import type { WorkflowDefinition } from '../workflows/index.js';

export interface PresentationMeta {
  workflow: WorkflowDefinition;
  composedContext: ComposedAgentContext;
  promptOptimization: PromptOptimizationPlan;
  immediateReply: string;
  sessionId: string;
}

export function presentAgentRun(result: AgentRunResult, meta: PresentationMeta) {
  return {
    ...toAgentRunResponse(result),
    sessionId: meta.sessionId,
    immediateReply: meta.immediateReply,
    agentArchitecture: {
      mainAgent: 'MainAgent',
      workflow: meta.workflow,
      context: meta.composedContext,
      promptOptimization: meta.promptOptimization,
    },
  };
}
