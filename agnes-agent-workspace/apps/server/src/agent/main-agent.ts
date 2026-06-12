import type { AgentTaskType } from '@agnes/agent-core';
import { captureSessionModelSnapshot } from '../services/sessionModelPreference.service.js';
import { composeAgentContext } from './context-composer.js';
import { loadAgentMemory } from './memory.js';
import { buildPromptOptimizationPlan } from './prompt-optimizer.js';
import { routeWorkflow } from './router.js';

export interface MainAgentPrepareInput {
  userInput: string;
  sessionId: string;
  explicitType?: AgentTaskType;
}

export async function prepareMainAgentRun(input: MainAgentPrepareInput) {
  const memory = await loadAgentMemory(input.sessionId);
  const routed = routeWorkflow({
    userInput: input.userInput,
    explicitType: input.explicitType,
    conversationHistory: memory.recentTurns,
  });
  const modelSnapshot = await captureSessionModelSnapshot(input.sessionId);
  const composedContext = composeAgentContext({
    userInput: input.userInput,
    memory,
    routeDecision: routed.routeDecision,
    workflow: routed.workflow,
    modelSnapshot: {
      provider: modelSnapshot.apiKey ? modelSnapshot.provider : 'mock',
      model: modelSnapshot.apiKey ? modelSnapshot.model : 'mock',
      baseUrl: modelSnapshot.baseUrl,
      temperature: modelSnapshot.temperature,
      configured: Boolean(modelSnapshot.apiKey),
      source: modelSnapshot.source,
      capturedAt: new Date().toISOString(),
    },
  });

  return {
    memory,
    routeDecision: routed.routeDecision,
    workflow: routed.workflow,
    immediateReply: routed.immediateReply,
    modelSnapshot,
    composedContext,
    promptOptimization: buildPromptOptimizationPlan(routed.workflow),
  };
}
