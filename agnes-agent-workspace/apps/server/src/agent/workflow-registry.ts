import {
  aigcMediaWorkflow,
  analysisWorkflow,
  chatWorkflow,
  pptGeneratorWorkflow,
  researchReportWorkflow,
  websiteBuilderWorkflow,
  writingWorkflow,
  type WorkflowDefinition,
  type WorkflowIntent,
} from '../workflows/index.js';

const WORKFLOWS = [
  chatWorkflow,
  researchReportWorkflow,
  websiteBuilderWorkflow,
  pptGeneratorWorkflow,
  aigcMediaWorkflow,
  writingWorkflow,
  analysisWorkflow,
];

export class WorkflowRegistry {
  private byIntent = new Map<WorkflowIntent, WorkflowDefinition>();
  private byId = new Map<string, WorkflowDefinition>();

  constructor(workflows: WorkflowDefinition[] = WORKFLOWS) {
    for (const workflow of workflows) {
      this.byIntent.set(workflow.intent, workflow);
      this.byId.set(workflow.id, workflow);
    }
  }

  getByIntent(intent: WorkflowIntent): WorkflowDefinition {
    return this.byIntent.get(intent) ?? chatWorkflow;
  }

  getById(id: string): WorkflowDefinition | undefined {
    return this.byId.get(id);
  }

  list(): WorkflowDefinition[] {
    return [...this.byId.values()];
  }
}

export const workflowRegistry = new WorkflowRegistry();
