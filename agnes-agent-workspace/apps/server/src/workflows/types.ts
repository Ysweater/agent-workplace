import type { AgentTaskType } from '@agnes/agent-core';

export type WorkflowIntent = AgentTaskType | 'chat';

export interface WorkflowDefinition {
  id: string;
  name: string;
  intent: WorkflowIntent;
  steps: string[];
  requiredTools: string[];
  artifactTypes: Array<'text' | 'markdown' | 'html' | 'json' | 'image' | 'video'>;
  resumePolicy: {
    skipCompleted: boolean;
    retryFailed: boolean;
    pendingCanUseNewModel: boolean;
  };
  promptOptimizePolicy: {
    required: boolean;
    toolName?: 'prompt_enhancer';
    target: WorkflowIntent;
    description: string;
  };
}
