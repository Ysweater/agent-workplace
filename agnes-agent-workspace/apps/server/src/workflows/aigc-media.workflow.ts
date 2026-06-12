import type { WorkflowDefinition } from './types.js';

export const aigcMediaWorkflow: WorkflowDefinition = {
  id: 'mediaWorkflow',
  name: '图片 / 视频 AIGC',
  intent: 'media',
  steps: ['prompt_optimize', 'generate_image_or_video', 'media_artifact', 'summary'],
  requiredTools: ['prompt_enhancer', 'image_generator', 'video_generator', 'summary'],
  artifactTypes: ['image', 'video', 'json', 'text'],
  resumePolicy: {
    skipCompleted: true,
    retryFailed: true,
    pendingCanUseNewModel: true,
  },
  promptOptimizePolicy: {
    required: true,
    toolName: 'prompt_enhancer',
    target: 'media',
    description: '把媒体需求扩写为主体、场景、构图、镜头、风格、质量和负向约束。',
  },
};
