import type { WorkflowDefinition } from './types.js';

export const websiteBuilderWorkflow: WorkflowDefinition = {
  id: 'websiteWorkflow',
  name: '一键建站',
  intent: 'website',
  steps: ['prompt_optimize', 'build_website', 'preview', 'summary'],
  requiredTools: ['prompt_enhancer', 'website_builder', 'summary'],
  artifactTypes: ['html', 'json', 'text'],
  resumePolicy: {
    skipCompleted: true,
    retryFailed: true,
    pendingCanUseNewModel: true,
  },
  promptOptimizePolicy: {
    required: true,
    toolName: 'prompt_enhancer',
    target: 'website',
    description: '把原始建站需求扩写为页面结构、视觉风格、技术约束和预览要求。',
  },
};
