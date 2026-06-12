import type { AgentContext, AgentTaskType } from '@agnes/agent-core';
import type { Request, Response } from 'express';
import { prepareMainAgentRun } from '../agent/main-agent.js';
import { presentAgentRun } from '../agent/presenter.js';
import { createAgentRuntime } from '../lib/agentSetup.js';
import { toAgentRunResponse } from '../lib/agentResponse.js';
import { createHttpError } from '../middleware/errorHandler.js';
import {
  createRunModelBindings,
  type ModelRunSnapshot,
} from '../services/modelProvider.service.js';
import { storageService } from '../services/storage.service.js';
import {
  buildImmediateAgentReply,
  routeAgentTask,
} from '../services/workflowRouter.service.js';
import {
  loadRunCheckpoint,
  saveRunCheckpoint,
} from '../services/checkpoint.service.js';
import {
  appendConversationTurns,
  deleteConversation,
  formatConversationForPrompt,
  loadConversation,
} from '../services/conversationMemory.service.js';
import { captureSessionModelSnapshot } from '../services/sessionModelPreference.service.js';

const TASK_TYPE_HINTS: Record<string, AgentTaskType> = {
  research: 'research',
  website: 'website',
  writing: 'writing',
  analysis: 'analysis',
  presentation: 'presentation',
  media: 'media',
  general: 'summary',
  summary: 'summary',
};

export async function runAgent(req: Request, res: Response): Promise<void> {
  const { userInput, agentType, runId, sessionId } = req.body as {
    userInput?: string;
    agentType?: string;
    runId?: string;
    sessionId?: string;
  };

  const trimmed = userInput?.trim();
  if (!trimmed) {
    throw createHttpError(400, 'userInput is required');
  }

  const id = runId ?? crypto.randomUUID();
  const conversationSessionId = sessionId?.trim() || id;
  const taskTypeHint = agentType ? TASK_TYPE_HINTS[agentType] : undefined;
  const prepared = await prepareMainAgentRun({
    userInput: trimmed,
    sessionId: conversationSessionId,
    explicitType: taskTypeHint,
  });
  const conversationHistory = prepared.memory.recentTurns;

  if (!agentType && isConversationalInput(trimmed)) {
    const response = await runConversationalReply(trimmed, id, conversationHistory, conversationSessionId);
    await persistConversation(conversationSessionId, trimmed, response, id);
    await storageService.saveSession(id, { ...response, sessionId: conversationSessionId });
    res.json({ ...response, sessionId: conversationSessionId });
    return;
  }

  const routeDecision = prepared.routeDecision;
  const modelSnapshot = prepared.modelSnapshot;
  const runtime = createAgentRuntime(modelSnapshot);

  const result = await runtime.run(trimmed, {
    runId: id,
    sessionId: conversationSessionId,
    conversationHistory,
    taskTypeHint: routeDecision.intent === 'chat' ? undefined : routeDecision.intent,
    routeDecision,
    modelSnapshot: toPublicModelSnapshot(modelSnapshot),
  });

  const response = presentAgentRun(result, {
    workflow: prepared.workflow,
    composedContext: prepared.composedContext,
    promptOptimization: prepared.promptOptimization,
    immediateReply: prepared.immediateReply,
    sessionId: conversationSessionId,
  });

  await persistConversation(conversationSessionId, trimmed, response, id);
  await storageService.saveSession(id, response);

  res.json(response);
}

export async function runAgentAsync(req: Request, res: Response): Promise<void> {
  const { userInput, agentType, runId, sessionId } = req.body as {
    userInput?: string;
    agentType?: string;
    runId?: string;
    sessionId?: string;
  };

  const trimmed = userInput?.trim();
  if (!trimmed) {
    throw createHttpError(400, 'userInput is required');
  }

  const id = runId ?? crypto.randomUUID();
  const conversationSessionId = sessionId?.trim() || id;
  const taskTypeHint = agentType ? TASK_TYPE_HINTS[agentType] : undefined;
  const prepared = await prepareMainAgentRun({
    userInput: trimmed,
    sessionId: conversationSessionId,
    explicitType: taskTypeHint,
  });
  const conversationHistory = prepared.memory.recentTurns;

  if (!agentType && isConversationalInput(trimmed)) {
    const response = await runConversationalReply(trimmed, id, conversationHistory, conversationSessionId);
    await persistConversation(conversationSessionId, trimmed, response, id);
    await storageService.saveSession(id, { ...response, sessionId: conversationSessionId });
    res.status(202).json({
      ...response,
      sessionId: conversationSessionId,
      immediateReply:
        (response.finalResult as { summary?: string })?.summary ?? response.artifacts?.[0]?.content,
    });
    return;
  }

  const routeDecision = prepared.routeDecision;
  const modelSnapshot = prepared.modelSnapshot;
  const createdAt = new Date().toISOString();
  const immediateReply = prepared.immediateReply;

  const initialResponse = {
    runId: id,
    status: 'running' as const,
    immediateReply,
    task: {
      id: crypto.randomUUID(),
      userInput: trimmed,
      taskType: routeDecision.intent === 'chat' ? 'summary' : routeDecision.intent,
      createdAt,
    },
    plan: null,
    toolCalls: [],
    artifacts: [
      {
        id: crypto.randomUUID(),
        type: 'text',
        title: 'Agnes 即时回复',
        content: immediateReply,
        createdAt,
      },
    ],
    sessionId: conversationSessionId,
    context: {
      routeDecision,
      composedContext: prepared.composedContext,
      workflow: prepared.workflow,
      promptOptimization: prepared.promptOptimization,
      sessionId: conversationSessionId,
      conversationHistory,
      modelSnapshot: toPublicModelSnapshot(modelSnapshot),
      finalResult: {
        mode: 'workflow_started',
        summary: immediateReply,
        workflowName: routeDecision.workflowName,
      },
    },
    trace: [
      {
        id: crypto.randomUUID(),
        type: 'route',
        timestamp: createdAt,
        data: {
          routeDecision,
          modelSnapshot: toPublicModelSnapshot(modelSnapshot),
        },
      },
    ],
    createdAt,
  };

  await storageService.saveSession(id, initialResponse);
  await saveRunCheckpoint({
    runId: id,
    status: 'running',
    workflowName: routeDecision.workflowName,
    completedNodeIds: [],
    pendingNodeIds: [],
    updatedAt: createdAt,
  });

  void executeAsyncRun(
    id,
    trimmed,
    routeDecision,
    modelSnapshot,
    conversationSessionId,
    conversationHistory,
    prepared.workflow,
    prepared.composedContext,
    prepared.promptOptimization,
    prepared.immediateReply,
  ).catch(async (err) => {
    const message = err instanceof Error ? err.message : 'Async run failed';
    const failedAt = new Date().toISOString();
    const failedResponse = {
      ...initialResponse,
      status: 'failed' as const,
      error: message,
      completedAt: failedAt,
      trace: [
        ...initialResponse.trace,
        {
          id: crypto.randomUUID(),
          type: 'error',
          timestamp: failedAt,
          data: { message },
        },
      ],
    };
    await saveRunCheckpoint({
      runId: id,
      status: 'failed',
      workflowName: routeDecision.workflowName,
      completedNodeIds: [],
      pendingNodeIds: [],
      updatedAt: failedAt,
      error: message,
    });
    await storageService.saveSession(id, failedResponse);
  });

  res.status(202).json(initialResponse);
}

async function executeAsyncRun(
  runId: string,
  userInput: string,
  routeDecision: ReturnType<typeof routeAgentTask>,
  modelSnapshot: ModelRunSnapshot,
  sessionId: string,
  conversationHistory: Awaited<ReturnType<typeof loadConversation>>,
  workflow: Awaited<ReturnType<typeof prepareMainAgentRun>>['workflow'],
  composedContext: Awaited<ReturnType<typeof prepareMainAgentRun>>['composedContext'],
  promptOptimization: Awaited<ReturnType<typeof prepareMainAgentRun>>['promptOptimization'],
  immediateReply: string,
) {
  const runtime = createAgentRuntime(modelSnapshot);
  const result = await runtime.run(userInput, {
    runId,
    sessionId,
    conversationHistory,
    taskTypeHint: routeDecision.intent === 'chat' ? undefined : routeDecision.intent,
    routeDecision,
    modelSnapshot: toPublicModelSnapshot(modelSnapshot),
  });
  const response = presentAgentRun(result, {
    workflow,
    composedContext,
    promptOptimization,
    immediateReply,
    sessionId,
  });
  await persistConversation(sessionId, userInput, response, runId);
  const checkpoint = result.context.loopCheckpoint;
  await saveRunCheckpoint({
    runId,
    status: result.status === 'completed' ? 'completed' : 'failed',
    workflowName: routeDecision.workflowName,
    currentNodeId: checkpoint?.currentNodeId,
    completedNodeIds: checkpoint?.completedNodeIds ?? [],
    pendingNodeIds: checkpoint?.pendingNodeIds ?? [],
    updatedAt: new Date().toISOString(),
    ...(result.error ? { error: result.error } : {}),
  });
  await storageService.saveSession(runId, response);
}

export async function resumeAgentRun(req: Request, res: Response): Promise<void> {
  const runId = String(req.params.runId);
  const saved = (await storageService.loadSession(runId)) as {
    status?: string;
    context?: AgentContext;
    error?: string;
  } | null;

  if (!saved?.context?.plan) {
    throw createHttpError(404, 'No resumable run found');
  }

  const checkpoint = await loadRunCheckpoint(runId);
  const canResume =
    saved.status === 'failed' ||
    checkpoint?.status === 'failed' ||
    (checkpoint?.pendingNodeIds?.length ?? 0) > 0;

  if (!canResume) {
    throw createHttpError(400, 'Run is not in a resumable state');
  }

  const modelSnapshot = await captureSessionModelSnapshot(saved.context.sessionId);
  const runtime = createAgentRuntime(modelSnapshot);
  const routeDecision = saved.context.routeDecision ?? routeAgentTask(saved.context.task.userInput);

  const result = await runtime.run(saved.context.task.userInput, {
    runId,
    sessionId: saved.context.sessionId,
    conversationHistory: saved.context.conversationHistory,
    taskTypeHint: routeDecision.intent === 'chat' ? undefined : routeDecision.intent,
    routeDecision,
    modelSnapshot: toPublicModelSnapshot(modelSnapshot),
    resumeContext: saved.context,
  });

  const response = {
    ...toAgentRunResponse(result),
    sessionId: saved.context.sessionId,
    immediateReply: buildImmediateAgentReply(routeDecision),
    resumed: true,
  };

  if (saved.context.sessionId) {
    await persistConversation(saved.context.sessionId, saved.context.task.userInput, response, runId);
  }

  const loopCheckpoint = result.context.loopCheckpoint;
  await saveRunCheckpoint({
    runId,
    status: result.status === 'completed' ? 'completed' : 'failed',
    workflowName: routeDecision.workflowName,
    currentNodeId: loopCheckpoint?.currentNodeId,
    completedNodeIds: loopCheckpoint?.completedNodeIds ?? [],
    pendingNodeIds: loopCheckpoint?.pendingNodeIds ?? [],
    updatedAt: new Date().toISOString(),
    ...(result.error ? { error: result.error } : {}),
  });
  await storageService.saveSession(runId, response);
  res.json(response);
}

export async function getRunStatus(req: Request, res: Response): Promise<void> {
  const runId = String(req.params.runId);
  const session = await storageService.loadSession(runId);
  const checkpoint = await loadRunCheckpoint(runId);
  if (!session && !checkpoint) {
    throw createHttpError(404, 'Run not found');
  }
  res.json({
    ...(session && typeof session === 'object' ? session : { runId }),
    checkpoint,
  });
}

function toPublicModelSnapshot(snapshot: ModelRunSnapshot) {
  return {
    provider: snapshot.apiKey ? snapshot.provider : 'mock',
    model: snapshot.apiKey ? snapshot.model : 'mock',
    ...(snapshot.baseUrl ? { baseUrl: snapshot.baseUrl } : {}),
    temperature: snapshot.temperature,
    configured: Boolean(snapshot.apiKey),
    source: snapshot.source,
    ...(snapshot.presetId ? { presetId: snapshot.presetId } : {}),
    ...(snapshot.label ? { label: snapshot.label } : {}),
    capturedAt: new Date().toISOString(),
  };
}

export async function getSession(req: Request, res: Response): Promise<void> {
  const sessionId = String(req.params.sessionId);
  const runs = await storageService.listSessionRuns(sessionId);
  if (runs.length > 0) {
    res.json({ sessionId, runs });
    return;
  }

  const data = await storageService.loadSession(sessionId);
  if (!data) {
    throw createHttpError(404, 'Session not found');
  }
  res.json(data);
}

export async function listSessions(req: Request, res: Response): Promise<void> {
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) ? rawLimit : 30;
  const sessions = await storageService.listSessions(limit);
  res.json({ sessions });
}

export async function deleteSession(req: Request, res: Response): Promise<void> {
  const sessionId = String(req.params.sessionId);
  const deleted = await storageService.deleteSession(sessionId);
  if (!deleted) {
    throw createHttpError(404, 'Session not found');
  }
  await deleteConversation(sessionId);
  res.status(204).send();
}

function isConversationalInput(input: string): boolean {
  const taskLike =
    /调研|研究报告|行业分析|市场报告|生成|创建|制作|搭建|网站|页面|小游戏|游戏|吃豆人|pacman|导出|报告|文案|方案|邮件|PRD|分析|复盘|评估|演示稿|幻灯片|PPT|图片|生图|海报|视频|AIGC|research|report|website|game|build|create|writing|analysis|presentation|slides|image|video/i.test(
      input,
    );
  const questionLike =
    /你能|你可以|是什么|为什么|怎么|如何|能否|可以吗|介绍|说明|帮助|hello|hi|what|why|how|can you/i.test(
      input,
    ) || input.endsWith('?') || input.endsWith('？');

  return questionLike && !taskLike;
}

function mockCapabilityReply(): string {
  return `可以。我现在是 Agnes Agent Workspace，一个 Web 端 Agent 工作台原型。
我支持两类交互：普通对话会先直接回答；明确的生产任务会进入 Agent 工作流并调用工具。

当前核心能力：
1. 正常对话：回答能力、方案、追问，并结合当前会话上下文。
2. 检索分析报告：规划 web_search -> research_report -> html_export -> summary，输出 Markdown 与 HTML 报告。
3. 一键建站：调用 website_builder 生成页面结构、文件清单和 preview/index.html 预览。
4. PPT 生成：调用 presentation_generator 输出结构化 slides、Markdown 大纲和 HTML 演示预览。
5. 图片/视频 AIGC：先用 prompt_enhancer 优化提示词，再调用 image_generator 或 video_generator。

工作台会展示计划步骤、工具调用、Trace、产物预览和模型快照。配置真实模型后，我会优先使用模型做自然语言理解和生成；没有密钥时会降级到可演示的本地 Mock 能力。`;
}

async function persistConversation(
  sessionId: string,
  userInput: string,
  response: {
    status: string;
    finalResult?: unknown;
    context?: { finalResult?: unknown };
    artifacts?: Array<{ content?: string }>;
  },
  runId: string,
) {
  const summary =
    (response.finalResult as { summary?: string } | undefined)?.summary ??
    (response.context?.finalResult as { summary?: string } | undefined)?.summary ??
    response.artifacts?.find((a) => a.content)?.content ??
    (response.status === 'completed' ? '任务已完成' : '任务执行中');

  await appendConversationTurns(sessionId, [
    { role: 'user', content: userInput, runId, timestamp: new Date().toISOString() },
    {
      role: 'assistant',
      content: String(summary).slice(0, 2000),
      runId,
      timestamp: new Date().toISOString(),
    },
  ]);
}

async function runConversationalReply(
  userInput: string,
  runId: string,
  conversationHistory: Awaited<ReturnType<typeof loadConversation>> = [],
  sessionId?: string,
) {
  const createdAt = new Date().toISOString();
  const runModel = createRunModelBindings(await captureSessionModelSnapshot(sessionId));
  const info = runModel.getModelsInfo();
  let answer = mockCapabilityReply();
  const historyBlock = formatConversationForPrompt(conversationHistory);

  if (!info.usingMock) {
    const generated = await runModel.generateText(
      [
        {
          role: 'system',
          content:
            '你是 Agnes Agent Workspace 的产品助手。请用简洁中文回答用户问题。若用户询问能力，说明你既支持普通对话，也支持调研报告、一键建站、PPT 生成、图片/视频 AIGC、工具调用轨迹和产物预览。',
        },
        ...(historyBlock
          ? [{ role: 'user' as const, content: `近期对话：\n${historyBlock}` }]
          : []),
        { role: 'user', content: userInput },
      ],
      { maxTokens: 800 },
    );
    answer = generated.content;
  }

  const completedAt = new Date().toISOString();
  const task = {
    id: crypto.randomUUID(),
    userInput,
    taskType: 'summary' as const,
    createdAt,
  };
  const artifact = {
    id: crypto.randomUUID(),
    type: 'text' as const,
    title: 'Agnes 回复',
    content: answer,
    createdAt: completedAt,
  };
  const context = {
    task,
    plan: null,
    toolCalls: [],
    stepOutputs: {},
    stepTransitions: [],
    artifacts: [artifact],
    finalResult: {
      mode: 'chat',
      summary: answer,
      answer,
      toolCallCount: 0,
    },
  };

  return {
    runId,
    status: 'completed' as const,
    task,
    plan: null,
    toolCalls: [],
    finalResult: context.finalResult,
    context,
    trace: [
      {
        id: crypto.randomUUID(),
        type: 'done',
        timestamp: completedAt,
        data: { finalResult: context.finalResult },
      },
    ],
    artifacts: [artifact],
    createdAt,
    completedAt,
    durationMs: new Date(completedAt).getTime() - new Date(createdAt).getTime(),
  };
}

async function loadConversationWithStorageFallback(
  sessionId: string,
): Promise<Awaited<ReturnType<typeof loadConversation>>> {
  const fromMemory = await loadConversation(sessionId);
  if (fromMemory.length > 0) return fromMemory;

  const runs = await storageService.listSessionRuns(sessionId);
  const turns: Awaited<ReturnType<typeof loadConversation>> = [];
  for (const run of runs) {
    if (!run || typeof run !== 'object') continue;
    const record = run as {
      runId?: string;
      task?: { userInput?: string };
      context?: { task?: { userInput?: string }; finalResult?: unknown };
      finalResult?: unknown;
      artifacts?: Array<{ content?: string }>;
      createdAt?: string;
      completedAt?: string;
    };
    const userInput = record.task?.userInput ?? record.context?.task?.userInput;
    if (userInput) {
      turns.push({
        role: 'user',
        content: userInput,
        runId: record.runId,
        timestamp: record.createdAt ?? new Date().toISOString(),
      });
    }

    const finalResult = (record.finalResult ?? record.context?.finalResult) as
      | { summary?: string; answer?: string }
      | undefined;
    const assistantText =
      finalResult?.answer ??
      finalResult?.summary ??
      record.artifacts?.find((artifact) => artifact.content)?.content;
    if (assistantText) {
      turns.push({
        role: 'assistant',
        content: String(assistantText).slice(0, 2000),
        runId: record.runId,
        timestamp: record.completedAt ?? record.createdAt ?? new Date().toISOString(),
      });
    }
  }
  return turns.slice(-40);
}
