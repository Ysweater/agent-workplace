export type AgentStepStatus = 'pending' | 'running' | 'success' | 'error';

export interface AgentTask {
  id: string;
  userInput: string;
  taskType: string;
  createdAt: string;
}

export interface AgentStep {
  id: string;
  title: string;
  toolName: string;
  reason: string;
  expectedOutput: string;
  status: AgentStepStatus;
  startedAt?: string;
  completedAt?: string;
}

export interface AgentPlan {
  id: string;
  taskType: string;
  steps: AgentStep[];
  createdAt: string;
}

export interface ToolCallRecord {
  id: string;
  stepId: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: unknown;
  success: boolean;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export interface Artifact {
  id: string;
  type: 'markdown' | 'html' | 'json' | 'text' | 'image' | 'video';
  title: string;
  content: string;
  createdAt: string;
}

export interface AgentRunResult {
  runId: string;
  sessionId?: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  immediateReply?: string;
  task?: AgentTask;
  plan?: AgentPlan | null;
  toolCalls?: ToolCallRecord[];
  finalResult?: unknown;
  context?: {
    task?: AgentTask;
    plan?: AgentPlan | null;
    toolCalls?: ToolCallRecord[];
    artifacts?: Artifact[];
    finalResult?: unknown;
  };
  artifacts?: Artifact[];
  trace?: TraceEvent[];
  createdAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
}

export interface SessionListItem {
  id: string;
  userInput: string;
  status: string;
  taskType?: string;
  createdAt: string;
  updatedAt?: string;
  runCount?: number;
}

export interface TraceEvent {
  id: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface HealthStatus {
  status: string;
  uptime?: number;
  provider?: string;
  configured?: boolean;
  storage?: { driver: string; fallback: boolean; detail: string };
  timestamp: string;
}

export type ModelCapability = 'chat' | 'image' | 'video';

export interface ModelInfo {
  provider: 'mock' | 'agnes' | 'openai' | 'deepseek' | 'zenmux' | 'custom' | string;
  model: string;
  configured: boolean;
  baseUrl?: string;
  baseUrlMasked?: string;
  temperature?: number;
  source?: 'env' | 'runtime';
  presetId?: string;
  label?: string;
}

export interface ModelConfigInput {
  provider: 'mock' | 'agnes' | 'openai' | 'deepseek' | 'zenmux' | 'custom';
  model: string;
  baseUrl: string;
  apiKey?: string;
  temperature: number;
  presetId?: string;
}

export interface ModelCatalogEntry {
  id: string;
  label: string;
  description: string;
  provider: string;
  model: string;
  baseUrl: string;
  capability: ModelCapability;
  configured: boolean;
  status: 'unknown' | 'ok' | 'error';
  statusMessage?: string;
  default?: boolean;
}

export interface ModelCatalogResponse {
  items: ModelCatalogEntry[];
  active: ModelInfo;
}

export interface ModelTestResult {
  ok: boolean;
  provider: string;
  model: string;
  latencyMs: number;
  message: string;
  sample?: string;
  mocked?: boolean;
}
