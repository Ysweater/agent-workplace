import type { WorkflowDefinition } from '../workflows/index.js';

export interface PromptOptimizationPlan {
  required: boolean;
  target: string;
  toolName?: string;
  policy: string;
}

export function buildPromptOptimizationPlan(workflow: WorkflowDefinition): PromptOptimizationPlan {
  return {
    required: workflow.promptOptimizePolicy.required,
    target: workflow.promptOptimizePolicy.target,
    toolName: workflow.promptOptimizePolicy.toolName,
    policy: workflow.promptOptimizePolicy.description,
  };
}
