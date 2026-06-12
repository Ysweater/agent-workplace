/** Agent task classification */
export type AgentTaskType =
  | 'research'
  | 'website'
  | 'writing'
  | 'analysis'
  | 'presentation'
  | 'media'
  | 'summary';

/** Step lifecycle within a plan */
export type AgentStepStatus = 'pending' | 'running' | 'success' | 'error';

/** Serializable artifact produced by tools */
export interface Artifact {
  id: string;
  type: 'markdown' | 'html' | 'json' | 'text' | 'image' | 'video';
  title: string;
  content: string;
  createdAt: string;
}

export interface RouteDecision {
  intent: AgentTaskType | 'chat';
  workflowName: string;
  confidence: number;
  reason: string;
  signals: string[];
}

export interface ModelSnapshot {
  provider: string;
  model: string;
  baseUrl?: string;
  temperature: number;
  configured: boolean;
  source: 'env' | 'runtime';
  capturedAt: string;
}

export interface LoopCheckpoint {
  runId: string;
  workflowName: string;
  currentNodeId?: string;
  completedNodeIds: string[];
  pendingNodeIds: string[];
  status: 'queued' | 'running' | 'completed' | 'failed' | 'paused';
  updatedAt: string;
}

/** User-submitted task */
export interface AgentTask {
  id: string;
  userInput: string;
  taskType: AgentTaskType;
  createdAt: string;
}

/** Single executable step in a plan */
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

/** Status transition for observability */
export interface StepTransition {
  stepId: string;
  title: string;
  toolName: string;
  status: AgentStepStatus;
  timestamp: string;
}

/** Ordered plan produced by Planner */
export interface AgentPlan {
  id: string;
  taskType: AgentTaskType;
  steps: AgentStep[];
  createdAt: string;
}

/** Record of one tool invocation */
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

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  runId?: string;
  timestamp: string;
}

/** Session context accumulated across the run loop */
export interface AgentContext {
  task: AgentTask;
  sessionId?: string;
  conversationHistory?: ConversationTurn[];
  routeDecision?: RouteDecision;
  modelSnapshot?: ModelSnapshot;
  loopCheckpoint?: LoopCheckpoint;
  plan: AgentPlan | null;
  toolCalls: ToolCallRecord[];
  stepOutputs: Record<string, unknown>;
  stepTransitions: StepTransition[];
  artifacts: Artifact[];
  finalResult?: unknown;
}

/** Result returned when a run finishes */
export interface AgentRunResult {
  runId: string;
  status: 'completed' | 'failed';
  context: AgentContext;
  trace: TraceEvent[];
  createdAt: string;
  completedAt: string;
  durationMs: number;
  error?: string;
}

/** Standard tool contract (Tool.ts思想) */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (
    input: Record<string, unknown>,
    ctx: AgentContext,
    services?: ToolExecutionServices,
  ) => Promise<ToolExecutionResult>;
}

/** Outcome of a single tool execution */
export interface ToolExecutionResult {
  success: boolean;
  output: unknown;
  error?: string;
}

/** Observability event for execution trace UI */
export type TraceEventType =
  | 'route'
  | 'plan'
  | 'checkpoint'
  | 'step_update'
  | 'tool_call'
  | 'tool_result'
  | 'artifact'
  | 'warning'
  | 'done'
  | 'error';

export interface TraceEvent {
  id: string;
  type: TraceEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

/** Optional LLM for plan generation */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
}

export interface LLMProvider {
  chat(messages: LLMMessage[]): Promise<LLMResponse>;
}

export interface SiteLaunchPayload {
  projectDir?: string;
  devUrl?: string;
  launchStatus?: 'ready' | 'failed' | 'skipped' | 'starting';
  launchMessage?: string;
  scaffoldType?: 'vite-game' | 'vite-landing' | 'html-preview-only';
}

export interface WebSearchSource {
  id: string;
  title: string;
  url: string;
  snippet: string;
}

export interface ToolExecutionServices {
  generateText?: (
    messages: LLMMessage[],
    options?: { temperature?: number; model?: string; maxTokens?: number },
  ) => Promise<string>;
  webSearch?: (
    query: string,
    maxResults?: number,
  ) => Promise<{
    sources: WebSearchSource[];
    provider?: string;
    mocked?: boolean;
    error?: string;
  }>;
  launchViteProject?: (
    requirement: string,
    output: {
      title: string;
      description: string;
      files: Array<{ path: string; language: string; content: string }>;
      previewNotes: string;
    },
  ) => Promise<SiteLaunchPayload>;
  generateImage?: (
    prompt: string,
    options?: { model?: string },
  ) => Promise<{ mimeType: string; base64: string; model: string; uri?: string }>;
  generateVideo?: (
    prompt: string,
    options?: { model?: string },
  ) => Promise<{ uri?: string; model: string; done: boolean; submitted: boolean }>;
}

export interface AgentRunOptions {
  runId?: string;
  sessionId?: string;
  taskTypeHint?: AgentTaskType;
  routeDecision?: RouteDecision;
  modelSnapshot?: ModelSnapshot;
  conversationHistory?: ConversationTurn[];
  /** Resume a failed/paused run from saved context (skips completed steps) */
  resumeContext?: AgentContext;
}

/** Optional prompt builders wired from @agnes/prompts at runtime */
export interface PlanningOptions {
  buildSystemPrompt(taskType: AgentTaskType, toolDescriptions: string): string;
  buildPlannerUserPrompt(params: {
    userInput: string;
    taskType: AgentTaskType;
    availableTools: string[];
    conversationHistory?: ConversationTurn[];
  }): string;
}
