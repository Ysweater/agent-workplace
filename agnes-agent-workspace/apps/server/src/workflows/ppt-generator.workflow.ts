import type { WorkflowDefinition } from './types.js';

export const pptGeneratorWorkflow: WorkflowDefinition = {
  id: 'presentationWorkflow',
  name: 'PPT 生成',
  intent: 'presentation',
  steps: ['prompt_optimize', 'generate_slides', 'deck_preview', 'summary'],
  requiredTools: ['prompt_enhancer', 'presentation_generator', 'summary'],
  artifactTypes: ['html', 'markdown', 'json', 'text'],
  resumePolicy: {
    skipCompleted: true,
    retryFailed: true,
    pendingCanUseNewModel: true,
  },
  promptOptimizePolicy: {
    required: true,
    toolName: 'prompt_enhancer',
    target: 'presentation',
    description: '把原始 PPT 需求扩写为听众、叙事线、页面结构、视觉建议和演讲备注要求。',
  },
};
