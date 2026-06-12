import type { WorkflowDefinition } from './types.js';

export const researchReportWorkflow: WorkflowDefinition = {
  id: 'researchWorkflow',
  name: '检索分析报告',
  intent: 'research',
  steps: ['prompt_optimize', 'web_search', 'research_report', 'html_preview', 'summary'],
  requiredTools: ['prompt_enhancer', 'web_search', 'research_report', 'html_export', 'summary'],
  artifactTypes: ['markdown', 'html', 'text'],
  resumePolicy: {
    skipCompleted: true,
    retryFailed: true,
    pendingCanUseNewModel: true,
  },
  promptOptimizePolicy: {
    required: true,
    toolName: 'prompt_enhancer',
    target: 'research',
    description: '先做语义拆解与搜索意图优化，再调用联网搜索和报告生成。',
  },
};
