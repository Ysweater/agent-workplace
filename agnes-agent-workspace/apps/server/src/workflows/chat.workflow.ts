import type { WorkflowDefinition } from './types.js';

export const chatWorkflow: WorkflowDefinition = {
  id: 'chatWorkflow',
  name: '正常对话',
  intent: 'chat',
  steps: ['perceive', 'compose_context', 'answer', 'persist'],
  requiredTools: [],
  artifactTypes: ['text'],
  resumePolicy: {
    skipCompleted: true,
    retryFailed: true,
    pendingCanUseNewModel: true,
  },
  promptOptimizePolicy: {
    required: false,
    target: 'chat',
    description: '普通对话不进入生产型 prompt optimizer，只组合会话上下文后直接回答。',
  },
};
