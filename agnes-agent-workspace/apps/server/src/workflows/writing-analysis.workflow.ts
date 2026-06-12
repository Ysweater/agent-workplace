import type { WorkflowDefinition } from './types.js';

export const writingWorkflow: WorkflowDefinition = {
  id: 'writingWorkflow',
  name: '结构化写作',
  intent: 'writing',
  steps: ['prompt_optimize', 'document_generator', 'html_preview', 'summary'],
  requiredTools: ['prompt_enhancer', 'document_generator', 'html_export', 'summary'],
  artifactTypes: ['markdown', 'html', 'text'],
  resumePolicy: {
    skipCompleted: true,
    retryFailed: true,
    pendingCanUseNewModel: true,
  },
  promptOptimizePolicy: {
    required: true,
    toolName: 'prompt_enhancer',
    target: 'writing',
    description: '把写作需求扩写为受众、语气、结构、事实边界和交付格式。',
  },
};

export const analysisWorkflow: WorkflowDefinition = {
  id: 'analysisWorkflow',
  name: '分析与建议',
  intent: 'analysis',
  steps: ['prompt_optimize', 'document_generator', 'html_preview', 'summary'],
  requiredTools: ['prompt_enhancer', 'document_generator', 'html_export', 'summary'],
  artifactTypes: ['markdown', 'html', 'text'],
  resumePolicy: {
    skipCompleted: true,
    retryFailed: true,
    pendingCanUseNewModel: true,
  },
  promptOptimizePolicy: {
    required: true,
    toolName: 'prompt_enhancer',
    target: 'analysis',
    description: '把分析需求扩写为判断标准、依据、假设、风险和建议动作。',
  },
};
