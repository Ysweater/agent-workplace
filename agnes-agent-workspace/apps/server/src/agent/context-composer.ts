import type { ModelSnapshot, RouteDecision } from '@agnes/agent-core';
import type { AgentMemory } from './memory.js';
import type { WorkflowDefinition } from '../workflows/index.js';

export interface ComposedAgentContext {
  currentGoal: string;
  recentTurns: AgentMemory['recentTurns'];
  sessionSummary: string;
  relevantArtifacts: Array<{ title: string; type: string }>;
  activeRunState?: unknown;
  lastWorkflow?: string;
  modelSnapshot?: ModelSnapshot;
  routeDecision: RouteDecision;
  workflow: Pick<WorkflowDefinition, 'id' | 'name' | 'steps' | 'requiredTools' | 'resumePolicy' | 'promptOptimizePolicy'>;
  constraints: string[];
}

function summarizeTurns(turns: AgentMemory['recentTurns']): string {
  if (turns.length === 0) return 'No prior turns in this session.';
  return turns
    .slice(-6)
    .map((turn) => `${turn.role === 'user' ? '用户' : '助手'}: ${turn.content.slice(0, 240)}`)
    .join('\n');
}

function extractArtifacts(runs: unknown[]): Array<{ title: string; type: string }> {
  const artifacts: Array<{ title: string; type: string }> = [];
  for (const run of runs.slice(-4)) {
    const list = (run as { artifacts?: Array<{ title?: string; type?: string }> })?.artifacts;
    if (!Array.isArray(list)) continue;
    for (const artifact of list) {
      if (artifact.title && artifact.type) {
        artifacts.push({ title: artifact.title, type: artifact.type });
      }
    }
  }
  return artifacts.slice(-8);
}

function lastWorkflowFromRuns(runs: unknown[]): string | undefined {
  const latest = [...runs].reverse().find(Boolean) as
    | { context?: { routeDecision?: { workflowName?: string } } }
    | undefined;
  return latest?.context?.routeDecision?.workflowName;
}

export function composeAgentContext(params: {
  userInput: string;
  memory: AgentMemory;
  routeDecision: RouteDecision;
  workflow: WorkflowDefinition;
  modelSnapshot?: ModelSnapshot;
}): ComposedAgentContext {
  return {
    currentGoal: params.userInput,
    recentTurns: params.memory.recentTurns.slice(-8),
    sessionSummary: summarizeTurns(params.memory.recentTurns),
    relevantArtifacts: extractArtifacts(params.memory.historicalRuns),
    lastWorkflow: lastWorkflowFromRuns(params.memory.historicalRuns),
    modelSnapshot: params.modelSnapshot,
    routeDecision: params.routeDecision,
    workflow: {
      id: params.workflow.id,
      name: params.workflow.name,
      steps: params.workflow.steps,
      requiredTools: params.workflow.requiredTools,
      resumePolicy: params.workflow.resumePolicy,
      promptOptimizePolicy: params.workflow.promptOptimizePolicy,
    },
    constraints: [
      'Do not pass raw user wording directly to production generators.',
      'Use registered tools only.',
      'Persist run state and artifacts for resume.',
      'Keep model snapshot immutable within a running step chain unless resuming pending work.',
    ],
  };
}
