import { extractArtifact, resolveArtifactFromOutput } from './artifact.js';
import type { AgentLoop } from './AgentLoop.js';
import type { ContextManager } from './ContextManager.js';
import type { ToolRegistry } from './ToolRegistry.js';
import type { AgentContext, AgentPlan, AgentStep, ToolExecutionServices } from './types.js';

const DEFAULT_MAX_RESULTS = 5;

/**
 * Executor runs plan steps sequentially, similar to a QueryEngine execution loop.
 * Unified tool input adaptation; artifacts are written via ContextManager only.
 */
export class Executor {
  constructor(
    private registry: ToolRegistry,
    private services: ToolExecutionServices = {},
  ) {}

  async executePlan(
    plan: AgentPlan,
    contextManager: ContextManager,
    options: { skipCompleted?: boolean; loop?: AgentLoop } = {},
  ): Promise<void> {
    const ctx = contextManager.getMutableContext();

    for (const step of plan.steps) {
      if (options.skipCompleted && step.status === 'success') {
        continue;
      }
      const completedNodeIds = plan.steps
        .filter((s) => s.status === 'success')
        .map((s) => s.id);
      contextManager.setLoopCheckpoint({
        runId: ctx.loopCheckpoint?.runId ?? ctx.task.id,
        workflowName: ctx.loopCheckpoint?.workflowName ?? `${plan.taskType}Workflow`,
        currentNodeId: step.id,
        completedNodeIds,
        pendingNodeIds: plan.steps
          .filter((s) => s.id !== step.id && s.status !== 'success')
          .map((s) => s.id),
        status: 'running',
        updatedAt: new Date().toISOString(),
      });
      await this.executeStep(step, ctx, contextManager, options.loop);
    }
  }

  private async executeStep(
    step: AgentStep,
    ctx: AgentContext,
    contextManager: ContextManager,
    loop?: AgentLoop,
  ): Promise<void> {
    contextManager.updateStepStatus(step.id, 'running');

    const tool = this.registry.getTool(step.toolName);
    if (!tool) {
      contextManager.updateStepStatus(step.id, 'error');
      throw new Error(`Tool not found: ${step.toolName}`);
    }

    const callId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const input = buildToolInput(step, ctx);

    loop?.record('act', 'started', `Executing tool node ${step.toolName}`, {
      stepId: step.id,
      title: step.title,
      toolName: step.toolName,
    });

    contextManager.addToolCall({
      id: callId,
      stepId: step.id,
      toolName: step.toolName,
      input,
      success: false,
      startedAt,
    });

    try {
      const result = await tool.execute(input, ctx, this.services);
      const completedAt = new Date().toISOString();

      contextManager.updateToolCall(callId, {
        output: result.output,
        success: result.success,
        error: result.error,
        completedAt,
      });

      if (!result.success) {
        contextManager.updateStepStatus(step.id, 'error');
        throw new Error(result.error ?? `Tool ${step.toolName} failed`);
      }

      contextManager.setStepOutput(step.id, result.output);

      const artifactTitle = resolveArtifactTitle(step, ctx, result.output);
      const artifact =
        resolveArtifactFromOutput(step.toolName, result.output, artifactTitle) ??
        extractArtifact(result.output);
      if (artifact) {
        contextManager.addArtifact(artifact);
      }

      contextManager.updateStepStatus(step.id, 'success');
      loop?.record('observe', 'completed', `Observed result from ${step.toolName}`, {
        stepId: step.id,
        toolName: step.toolName,
        hasArtifact: Boolean(artifact),
      });
      loop?.record('reflect', 'completed', `Step ${step.id} satisfied expected output`, {
        stepId: step.id,
        expectedOutput: step.expectedOutput,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      contextManager.updateToolCall(callId, {
        success: false,
        error: message,
        completedAt: new Date().toISOString(),
      });
      contextManager.updateStepStatus(step.id, 'error');
      loop?.record('reflect', 'failed', `Step ${step.id} failed and run can be resumed`, {
        stepId: step.id,
        toolName: step.toolName,
        error: message,
      });
      throw err;
    }
  }
}

function buildToolInput(step: AgentStep, ctx: AgentContext): Record<string, unknown> {
  const userInput = ctx.task.userInput;
  const optimizedTask = extractPrompt(findOutputByTool(ctx, 'prompt_enhancer'), userInput);

  switch (step.toolName) {
    case 'web_search':
      return {
        query:
          ctx.task.taskType === 'research' ? extractSearchQuery(optimizedTask, userInput) : userInput,
        ...(ctx.task.taskType === 'research'
          ? { researchBrief: optimizedTask, originalQuery: userInput }
          : {}),
        maxResults: DEFAULT_MAX_RESULTS,
      };

    case 'research_report': {
      const searchOutput = findOutputByTool(ctx, 'web_search');
      const sources = extractSources(searchOutput);
      return {
        topic: userInput,
        researchBrief: optimizedTask,
        originalTopic: userInput,
        sources,
      };
    }

    case 'html_export': {
      const reportOutput =
        findOutputByTool(ctx, 'research_report') ?? findOutputByTool(ctx, 'document_generator');
      const markdown = extractMarkdown(reportOutput, ctx);
      const title = extractReportTitle(reportOutput, userInput);
      return { title, markdown };
    }

    case 'website_builder':
      return { requirement: optimizedTask, originalRequirement: userInput };

    case 'document_generator':
      return {
        task: optimizedTask,
        originalTask: userInput,
        taskType: ctx.task.taskType,
        conversationContext: formatConversationContext(ctx),
      };

    case 'presentation_generator':
      return {
        task: optimizedTask,
        originalTask: userInput,
        conversationContext: formatConversationContext(ctx),
      };

    case 'summary':
      return { context: buildSummaryContext(ctx) };

    case 'prompt_enhancer':
      return {
        task: userInput,
        target: ctx.task.taskType === 'media' ? 'media' : ctx.task.taskType,
      };

    case 'image_generator': {
      const enhanced = findOutputByTool(ctx, 'prompt_enhancer');
      return {
        prompt: extractPrompt(enhanced, userInput),
      };
    }

    case 'video_generator': {
      const enhanced = findOutputByTool(ctx, 'prompt_enhancer');
      return {
        prompt: extractPrompt(enhanced, userInput),
      };
    }

    default:
      return { context: userInput };
  }
}

function findOutputByTool(ctx: AgentContext, toolName: string): unknown {
  if (!ctx.plan) return undefined;
  const step = ctx.plan.steps.find((s) => s.toolName === toolName);
  if (!step) return undefined;
  return ctx.stepOutputs[step.id];
}

function resolveArtifactTitle(
  step: AgentStep,
  ctx: AgentContext,
  output: unknown,
): string {
  if (step.toolName === 'html_export') {
    const reportOutput = findOutputByTool(ctx, 'research_report');
    return extractReportTitle(reportOutput, ctx.task.userInput);
  }
  if (output && typeof output === 'object' && 'title' in output) {
    const title = (output as Record<string, unknown>).title;
    if (typeof title === 'string') return title;
  }
  return ctx.task.userInput;
}

function extractSources(searchOutput: unknown): unknown[] {
  if (!searchOutput || typeof searchOutput !== 'object') return [];
  const record = searchOutput as Record<string, unknown>;
  if (Array.isArray(record.sources)) return record.sources;
  return [];
}

function extractReportTitle(reportOutput: unknown, fallback: string): string {
  if (reportOutput && typeof reportOutput === 'object') {
    const title = (reportOutput as Record<string, unknown>).title;
    if (typeof title === 'string' && title.trim()) return title;
  }
  return `Research Report: ${fallback}`;
}

function extractMarkdown(reportOutput: unknown, ctx: AgentContext): string {
  const fromArtifact = extractArtifact(reportOutput);
  if (fromArtifact?.type === 'markdown') return fromArtifact.content;

  if (reportOutput && typeof reportOutput === 'object') {
    const record = reportOutput as Record<string, unknown>;
    if (typeof record.markdown === 'string') return record.markdown;
    if (typeof record.content === 'string') return record.content;
  }

  const existing = ctx.artifacts.find((a) => a.type === 'markdown');
  return existing?.content ?? '';
}

function extractPrompt(output: unknown, fallback: string): string {
  if (output && typeof output === 'object') {
    const record = output as Record<string, unknown>;
    if (typeof record.enhancedPrompt === 'string' && record.enhancedPrompt.trim()) {
      return record.enhancedPrompt;
    }
    if (typeof record.prompt === 'string' && record.prompt.trim()) {
      return record.prompt;
    }
  }
  return fallback;
}

function extractSearchQuery(brief: string, fallback: string): string {
  const line = brief
    .split('\n')
    .map((part) => part.trim())
    .find((part) => /^search query\s*:/i.test(part));
  const query = line?.replace(/^search query\s*:\s*/i, '').trim();
  return query || fallback;
}

function buildSummaryContext(ctx: AgentContext): string {
  const parts: string[] = [`Task: ${ctx.task.userInput}`];
  const conversationContext = formatConversationContext(ctx);
  if (conversationContext) {
    parts.push(`Conversation Context:\n${conversationContext}`);
  }

  if (ctx.plan) {
    for (const step of ctx.plan.steps) {
      const output = ctx.stepOutputs[step.id];
      if (output !== undefined) {
        parts.push(`[${step.toolName}] ${stringifyOutput(output)}`);
      }
    }
  }

  return parts.join('\n\n');
}

function formatConversationContext(ctx: AgentContext): string {
  const turns = ctx.conversationHistory?.slice(-8) ?? [];
  return turns
    .map((turn) => `${turn.role === 'user' ? '用户' : '助手'}: ${turn.content}`)
    .join('\n');
}

function stringifyOutput(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}
