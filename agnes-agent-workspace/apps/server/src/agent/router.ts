import type { AgentTaskType, ConversationTurn } from '@agnes/agent-core';
import { buildImmediateAgentReply, routeAgentTask } from '../services/workflowRouter.service.js';
import { workflowRegistry } from './workflow-registry.js';

export function routeWorkflow(params: {
  userInput: string;
  explicitType?: AgentTaskType;
  conversationHistory?: ConversationTurn[];
}) {
  const routeDecision = routeAgentTask(
    params.userInput,
    params.explicitType,
    params.conversationHistory ?? [],
  );
  const workflow = workflowRegistry.getByIntent(
    routeDecision.intent === 'chat' ? 'chat' : routeDecision.intent,
  );
  return {
    routeDecision,
    workflow,
    immediateReply: buildImmediateAgentReply(routeDecision),
  };
}
