import type { LLMMessage, LLMProvider, LLMResponse } from '@agnes/agent-core';
import { getPresetById } from '../config/modelCatalog.js';
import { getDefaultChatPreset, selectPresetConfig } from './modelCatalog.service.js';
import { generateZenmuxChat } from './zenmuxMedia.service.js';

export type ModelProviderType = 'mock' | 'agnes' | 'openai' | 'deepseek' | 'zenmux' | 'custom';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  temperature?: number;
  model?: string;
  maxTokens?: number;
}

export interface GenerateTextResult {
  content: string;
  provider: ModelProviderType | 'mock';
  model: string;
  mocked: boolean;
}

export interface GenerateJsonResult<T = unknown> {
  data: T;
  content: string;
  provider: ModelProviderType | 'mock';
  model: string;
  mocked: boolean;
}

export interface ModelsInfo {
  provider: ModelProviderType;
  model: string;
  configured: boolean;
  temperature: number;
  usingMock: boolean;
  baseUrl?: string;
  source: 'env' | 'runtime';
}

/** Public API shape — never includes API keys */
export interface PublicModelsInfo {
  provider: ModelProviderType | 'mock';
  model: string;
  configured: boolean;
  baseUrl?: string;
  baseUrlMasked: string;
  temperature: number;
  source: 'env' | 'runtime';
  presetId?: string;
  label?: string;
}

const PROVIDER_BASE_URLS: Record<Exclude<ModelProviderType, 'mock' | 'custom'>, string> = {
  agnes: 'https://apihub.agnes-ai.com/v1',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  zenmux: 'https://zenmux.ai/api/vertex-ai',
};

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TEMPERATURE = 0.2;

const PROVIDER_DEFAULT_MODELS: Record<
  Exclude<ModelProviderType, 'mock' | 'custom'>,
  string
> = {
  agnes: 'agnes-2.0-flash',
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  zenmux: 'google/gemini-3.1-flash-image',
};

export interface ModelTestResult {
  ok: boolean;
  provider: ModelProviderType | 'mock';
  model: string;
  latencyMs: number;
  message: string;
  sample?: string;
  mocked?: boolean;
}

export interface RuntimeModelConfigInput {
  provider?: ModelProviderType;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  temperature?: number;
  presetId?: string;
}

interface RuntimeModelConfig {
  provider?: ModelProviderType;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  temperature?: number;
  presetId?: string;
  label?: string;
}

/** Frozen model config for a single agent run — immune to mid-run UI switches */
export interface ModelRunSnapshot {
  provider: ModelProviderType;
  model: string;
  baseUrl: string;
  apiKey: string;
  temperature: number;
  source: 'env' | 'runtime';
  label?: string;
  presetId?: string;
}

export interface RunModelBindings {
  snapshot: ModelRunSnapshot;
  generateText: (
    messages: ModelMessage[],
    options?: GenerateOptions,
  ) => Promise<GenerateTextResult>;
  generateJson: <T = unknown>(
    messages: ModelMessage[],
    options?: GenerateOptions,
  ) => Promise<GenerateJsonResult<T>>;
  getModelsInfo: () => ModelsInfo;
  createPlannerLLM: () => LLMProvider;
}

let runtimeConfig: RuntimeModelConfig = {};

function hasRuntimeConfig(): boolean {
  return Object.keys(runtimeConfig).length > 0;
}

function readProvider(): ModelProviderType {
  const raw = (runtimeConfig.provider ?? process.env.MODEL_PROVIDER ?? 'mock').toLowerCase();
  if (
    raw === 'mock' ||
    raw === 'agnes' ||
    raw === 'openai' ||
    raw === 'deepseek' ||
    raw === 'zenmux' ||
    raw === 'custom'
  ) {
    return raw;
  }
  return 'mock';
}

function readApiKeyForProvider(provider: ModelProviderType): string {
  const runtime = runtimeConfig.apiKey?.trim();
  if (runtime) return runtime;
  switch (provider) {
    case 'agnes':
      return process.env.AGNES_API_KEY?.trim() || process.env.MODEL_API_KEY?.trim() || '';
    case 'openai':
      return process.env.OPENAI_API_KEY?.trim() || '';
    case 'deepseek':
      return process.env.DEEPSEEK_API_KEY?.trim() || '';
    case 'zenmux':
      return process.env.ZENMUX_API_KEY?.trim() || '';
    case 'custom':
      return process.env.MODEL_API_KEY?.trim() || '';
    default:
      return '';
  }
}

function readApiKey(): string {
  return readApiKeyForProvider(readProvider());
}

function readModel(): string {
  const configured = runtimeConfig.model?.trim() || process.env.MODEL_NAME?.trim();
  if (configured) return configured;
  const provider = readProvider();
  if (provider in PROVIDER_DEFAULT_MODELS) {
    return PROVIDER_DEFAULT_MODELS[provider as keyof typeof PROVIDER_DEFAULT_MODELS];
  }
  return DEFAULT_MODEL;
}

function readTemperature(): number {
  const value = Number(runtimeConfig.temperature ?? process.env.MODEL_TEMPERATURE);
  return Number.isFinite(value) ? value : DEFAULT_TEMPERATURE;
}

function resolveRunConfig(snapshot?: ModelRunSnapshot): ModelRunSnapshot {
  if (snapshot) return snapshot;
  const provider = readProvider();
  return {
    provider,
    model: readModel(),
    baseUrl: resolveBaseUrl(provider),
    apiKey: readApiKey(),
    temperature: readTemperature(),
    source: hasRuntimeConfig() ? 'runtime' : 'env',
    ...(runtimeConfig.label ? { label: runtimeConfig.label } : {}),
    ...(runtimeConfig.presetId ? { presetId: runtimeConfig.presetId } : {}),
  };
}

function resolveInputSnapshot(input: RuntimeModelConfigInput): ModelRunSnapshot {
  if (input.presetId) {
    const preset = selectPresetConfig(input.presetId);
    return {
      provider: preset.provider as ModelProviderType,
      model: preset.model,
      baseUrl: preset.baseUrl,
      apiKey: preset.apiKey,
      temperature: readTemperature(),
      source: 'runtime',
      presetId: preset.presetId,
      label: getPresetById(input.presetId)?.label,
    };
  }

  const provider = input.provider ?? readProvider();
  if (
    provider !== 'mock' &&
    provider !== 'agnes' &&
    provider !== 'openai' &&
    provider !== 'deepseek' &&
    provider !== 'zenmux' &&
    provider !== 'custom'
  ) {
    throw new Error('Unsupported MODEL_PROVIDER');
  }

  const presetBaseUrl =
    provider in PROVIDER_BASE_URLS
      ? PROVIDER_BASE_URLS[provider as keyof typeof PROVIDER_BASE_URLS]
      : '';
  const defaultModel =
    provider in PROVIDER_DEFAULT_MODELS
      ? PROVIDER_DEFAULT_MODELS[provider as keyof typeof PROVIDER_DEFAULT_MODELS]
      : readModel();
  const temperature = Number.isFinite(Number(input.temperature))
    ? Math.min(Math.max(Number(input.temperature), 0), 2)
    : readTemperature();

  return {
    provider,
    model: input.model?.trim() || defaultModel,
    baseUrl: input.baseUrl?.trim() || presetBaseUrl,
    apiKey: input.apiKey?.trim() || (provider === 'mock' ? '' : readApiKeyForProvider(provider)),
    temperature,
    source: 'runtime',
  };
}

/** Capture current model settings at task start */
export function captureModelSnapshot(): ModelRunSnapshot {
  return resolveRunConfig();
}

function resolveBaseUrl(provider: ModelProviderType): string {
  const configured = runtimeConfig.baseUrl?.trim() || process.env.MODEL_BASE_URL?.trim();
  if (configured && provider !== 'zenmux') return configured.replace(/\/$/, '');
  if (runtimeConfig.baseUrl?.trim()) return runtimeConfig.baseUrl.trim().replace(/\/$/, '');
  if (provider === 'custom') return '';
  if (provider === 'mock') return '';
  if (provider in PROVIDER_BASE_URLS) {
    return PROVIDER_BASE_URLS[provider as keyof typeof PROVIDER_BASE_URLS];
  }
  return '';
}

function maskApiKey(key: string): string {
  if (!key) return '(empty)';
  if (key.length <= 8) return '***';
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

export function maskBaseUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const hostParts = parsed.hostname.split('.');
    const maskedHost =
      hostParts.length > 2
        ? `${hostParts[0]}.***.${hostParts.slice(-2).join('.')}`
        : parsed.hostname;
    return `${parsed.protocol}//${maskedHost}${parsed.pathname.replace(/\/$/, '')}`;
  } catch {
    return url.length > 24 ? `${url.slice(0, 12)}...${url.slice(-8)}` : url;
  }
}

export function getPublicModelsInfo(): PublicModelsInfo {
  const info = getModelProviderService().getModelsInfo();
  const baseUrl = info.baseUrl ?? '';

  return {
    provider: info.usingMock ? 'mock' : info.provider,
    model: info.usingMock ? 'mock' : info.model,
    configured: info.configured,
    ...(baseUrl ? { baseUrl } : {}),
    baseUrlMasked: baseUrl ? maskBaseUrl(baseUrl) : '',
    temperature: info.temperature,
    source: info.source,
    ...(runtimeConfig.presetId ? { presetId: runtimeConfig.presetId } : {}),
    ...(runtimeConfig.label ? { label: runtimeConfig.label } : {}),
  };
}

function logInfo(message: string): void {
  console.log(`[model-provider] ${message}`);
}

function logWarn(message: string): void {
  console.warn(`[model-provider] ${message}`);
}

function shouldUseMock(provider: ModelProviderType, apiKey: string): boolean {
  return provider === 'mock' || !apiKey;
}

function lastUserContent(messages: ModelMessage[]): string {
  return [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
}

function mockText(messages: ModelMessage[]): string {
  const input = lastUserContent(messages);
  const taskType =
    input.match(/任务类型\s*\n\s*(research|website|presentation|media|writing|analysis|summary|general)/i)?.[1]?.toLowerCase() ??
    input.match(/Task type:\s*(research|website|presentation|media|writing|analysis|summary|general)/i)?.[1]?.toLowerCase();

  if (/json|array|\[/i.test(input) || messages.some((m) => /json/i.test(m.content))) {
    if (taskType === 'website' || (!taskType && /website|game|pacman|吃豆人|小游戏|网站/i.test(input))) {
      return JSON.stringify([
        { title: 'Plan website or game', toolName: 'website_builder', reason: 'Build an interactive preview', expectedOutput: 'Website/game files and preview HTML' },
        { title: 'Summarize build output', toolName: 'summary', reason: 'Summarize generated files and usage', expectedOutput: 'Execution summary' },
      ]);
    }
    if (taskType === 'presentation' || (!taskType && /ppt|presentation|slides|deck|演示稿|幻灯片|路演/i.test(input))) {
      return JSON.stringify([
        { title: 'Generate presentation deck', toolName: 'presentation_generator', reason: 'Create structured slides and HTML deck preview', expectedOutput: 'Slides, Markdown outline, and HTML deck preview' },
        { title: 'Summarize deck structure', toolName: 'summary', reason: 'Summarize the story flow', expectedOutput: 'Execution summary' },
      ]);
    }
    if (taskType === 'media' || (!taskType && /image|poster|video|aigc|图片|海报|视频|生图|画一张/i.test(input))) {
      return JSON.stringify([
        { title: 'Enhance media prompt', toolName: 'prompt_enhancer', reason: 'Optimize prompt before AIGC generation', expectedOutput: 'Enhanced prompt with constraints' },
        { title: /video|视频/i.test(input) ? 'Generate video artifact' : 'Generate image artifact', toolName: /video|视频/i.test(input) ? 'video_generator' : 'image_generator', reason: 'Generate media from enhanced prompt', expectedOutput: 'Media artifact and metadata' },
        { title: 'Summarize media output', toolName: 'summary', reason: 'Explain generation choices', expectedOutput: 'Execution summary' },
      ]);
    }
    if (taskType === 'writing' || (!taskType && /writing|copy|email|文案|方案|邮件|PRD/i.test(input))) {
      return JSON.stringify([
        { title: 'Draft structured content', toolName: 'document_generator', reason: 'Create structured Markdown content', expectedOutput: 'Markdown document' },
        { title: 'Export document preview', toolName: 'html_export', reason: 'Create readable HTML preview', expectedOutput: 'HTML preview' },
        { title: 'Summarize writing output', toolName: 'summary', reason: 'Summarize output', expectedOutput: 'Execution summary' },
      ]);
    }
    if (taskType === 'analysis' || (!taskType && /analysis|analyze|compare|分析|复盘|对比|评估/i.test(input))) {
      return JSON.stringify([
        { title: 'Analyze provided material', toolName: 'document_generator', reason: 'Extract findings and recommendations', expectedOutput: 'Structured analysis in Markdown' },
        { title: 'Export analysis preview', toolName: 'html_export', reason: 'Create readable HTML preview', expectedOutput: 'HTML preview' },
        { title: 'Summarize findings', toolName: 'summary', reason: 'Summarize output', expectedOutput: 'Execution summary' },
      ]);
    }
    if (taskType === 'summary' || (!taskType && /summary|总结/i.test(input) && !/research|report|调研|网站|game|小游戏/i.test(input))) {
      return JSON.stringify([
        { title: 'Summarize content', toolName: 'summary', reason: 'Summarize the user request', expectedOutput: 'Execution summary' },
      ]);
    }
    return JSON.stringify([
      { title: 'Search the web', toolName: 'web_search', reason: 'Gather sources', expectedOutput: 'Search results' },
      { title: 'Write report', toolName: 'research_report', reason: 'Structure findings', expectedOutput: 'Markdown report' },
      { title: 'Export HTML preview', toolName: 'html_export', reason: 'Create report preview', expectedOutput: 'HTML preview' },
      { title: 'Summarize conclusions', toolName: 'summary', reason: 'Summarize output', expectedOutput: 'Execution summary' },
    ]);
  }

  if (/game|吃豆人|pacman|website|网站/i.test(input)) {
    return '1. Plan website/game structure\n2. Build components\n3. Summarize output';
  }

  return [
    '1. Gather relevant information',
    '2. Analyze and summarize findings',
    '3. Generate final artifact',
  ].join('\n');
}

function mockJson<T>(messages: ModelMessage[]): T {
  const text = mockText(messages);
  try {
    return JSON.parse(text) as T;
  } catch {
    return { summary: text } as T;
  }
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

class ModelProviderService {
  async generateText(
    messages: ModelMessage[],
    options: GenerateOptions = {},
    snapshot?: ModelRunSnapshot,
  ): Promise<GenerateTextResult> {
    const cfg = resolveRunConfig(snapshot);
    const provider = cfg.provider;
    const apiKey = cfg.apiKey;
    const model = options.model ?? cfg.model;
    const temperature = options.temperature ?? cfg.temperature;

    if (shouldUseMock(provider, apiKey)) {
      logInfo(`generateText using mock (provider=${provider})`);
      return {
        content: mockText(messages),
        provider: 'mock',
        model: 'mock',
        mocked: true,
      };
    }

    try {
      const content = await this.callChatCompletions(messages, {
        model,
        temperature,
        maxTokens: options.maxTokens,
        jsonMode: false,
        provider,
        apiKey,
        baseUrl: cfg.baseUrl,
      });

      return { content, provider, model, mocked: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logWarn(`generateText failed, degrading to mock: ${message}`);
      return {
        content: mockText(messages),
        provider: 'mock',
        model: 'mock',
        mocked: true,
      };
    }
  }

  async generateJson<T = unknown>(
    messages: ModelMessage[],
    options: GenerateOptions = {},
    snapshot?: ModelRunSnapshot,
  ): Promise<GenerateJsonResult<T>> {
    const cfg = resolveRunConfig(snapshot);
    const provider = cfg.provider;
    const apiKey = cfg.apiKey;
    const model = options.model ?? cfg.model;
    const temperature = options.temperature ?? cfg.temperature;

    if (shouldUseMock(provider, apiKey)) {
      logInfo(`generateJson using mock (provider=${provider})`);
      const data = mockJson<T>(messages);
      return {
        data,
        content: JSON.stringify(data),
        provider: 'mock',
        model: 'mock',
        mocked: true,
      };
    }

    try {
      const content = await this.callChatCompletions(messages, {
        model,
        temperature,
        maxTokens: options.maxTokens,
        jsonMode: true,
        provider,
        apiKey,
        baseUrl: cfg.baseUrl,
      });

      const data = parseJsonContent<T>(content);
      return { data, content, provider, model, mocked: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logWarn(`generateJson failed, degrading to mock: ${message}`);
      const data = mockJson<T>(messages);
      return {
        data,
        content: JSON.stringify(data),
        provider: 'mock',
        model: 'mock',
        mocked: true,
      };
    }
  }

  getModelsInfo(snapshot?: ModelRunSnapshot): ModelsInfo {
    if (snapshot) {
      const usingMock = shouldUseMock(snapshot.provider, snapshot.apiKey);
      return {
        provider: snapshot.provider,
        model: snapshot.model,
        configured: !usingMock,
        temperature: snapshot.temperature,
        usingMock,
        source: snapshot.source,
        ...(snapshot.baseUrl ? { baseUrl: snapshot.baseUrl } : {}),
      };
    }

    const provider = readProvider();
    const apiKey = readApiKey();
    const usingMock = shouldUseMock(provider, apiKey);
    const baseUrl = resolveBaseUrl(provider);

    return {
      provider,
      model: readModel(),
      configured: !usingMock,
      temperature: readTemperature(),
      usingMock,
      source: hasRuntimeConfig() ? 'runtime' : 'env',
      ...(baseUrl ? { baseUrl } : {}),
    };
  }

  private async callChatCompletions(
    messages: ModelMessage[],
    opts: {
      model: string;
      temperature: number;
      maxTokens?: number;
      jsonMode: boolean;
      provider: ModelProviderType;
      apiKey: string;
      baseUrl?: string;
    },
  ): Promise<string> {
    if (opts.provider === 'zenmux') {
      logInfo(`ZenMux generateContent model=${opts.model}`);
      const content = await generateZenmuxChat(messages, opts.model);
      if (!content) throw new Error('ZenMux returned empty content');
      return content;
    }

    const baseUrl = opts.baseUrl || resolveBaseUrl(opts.provider);
    if (!baseUrl) {
      throw new Error(`No MODEL_BASE_URL configured for provider "${opts.provider}"`);
    }

    const url = `${baseUrl}/chat/completions`;
    logInfo(`POST ${url} model=${opts.model} provider=${opts.provider}`);

    const body: Record<string, unknown> = {
      model: opts.model,
      messages,
      temperature: opts.temperature,
    };

    if (opts.maxTokens !== undefined) {
      body.max_tokens = opts.maxTokens;
    }

    if (opts.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const raw = await response.text();
    let data: ChatCompletionResponse;
    try {
      data = JSON.parse(raw) as ChatCompletionResponse;
    } catch {
      throw new Error(`Invalid JSON response (${response.status}): ${raw.slice(0, 200)}`);
    }

    if (!response.ok) {
      const apiMessage = data.error?.message ?? response.statusText;
      throw new Error(`Chat completions error ${response.status}: ${apiMessage}`);
    }

    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content) {
      throw new Error('Chat completions returned empty content');
    }

    return content;
  }
}

function parseJsonContent<T>(content: string): T {
  const trimmed = content.trim();
  const jsonBlock = trimmed.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const candidate = jsonBlock ?? trimmed;

  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    }
    const arrStart = candidate.indexOf('[');
    const arrEnd = candidate.lastIndexOf(']');
    if (arrStart >= 0 && arrEnd > arrStart) {
      return JSON.parse(candidate.slice(arrStart, arrEnd + 1)) as T;
    }
    throw new Error('Failed to parse JSON from model response');
  }
}

let serviceInstance: ModelProviderService | null = null;

export function getModelProviderService(): ModelProviderService {
  if (!serviceInstance) {
    serviceInstance = new ModelProviderService();
  }
  return serviceInstance;
}

/** Adapter for agent-core LLMProvider interface */
export function createModelProvider(): LLMProvider {
  const service = getModelProviderService();
  return {
    async chat(messages: LLMMessage[]): Promise<LLMResponse> {
      const result = await service.generateText(messages, { temperature: 0.2, maxTokens: 2000 });
      return { content: result.content };
    },
  };
}

function buildPlannerLLM(
  service: ModelProviderService,
  snapshot?: ModelRunSnapshot,
): LLMProvider {
  return {
    async chat(messages: LLMMessage[]): Promise<LLMResponse> {
      const textResult = await service.generateText(
        messages,
        { temperature: 0.2, maxTokens: 2000 },
        snapshot,
      );
      if (!textResult.mocked && /\[[\s\S]*\]/.test(textResult.content)) {
        return { content: textResult.content };
      }

      try {
        const jsonResult = await service.generateJson<{ steps?: unknown[] } | unknown[]>(
          messages,
          { temperature: 0.2, maxTokens: 2000 },
          snapshot,
        );
        if (!jsonResult.mocked) {
          const payload = jsonResult.data;
          const steps = Array.isArray(payload)
            ? payload
            : Array.isArray(payload.steps)
              ? payload.steps
              : null;
          if (steps) return { content: JSON.stringify(steps) };
        }
      } catch {
        // fall through to text content
      }

      return { content: textResult.content };
    },
  };
}

/** Planner LLM — prefers structured JSON array output when supported */
export function createPlannerModelProvider(): LLMProvider {
  return buildPlannerLLM(getModelProviderService());
}

/** Model bindings pinned for one agent run */
export function createRunModelBindings(snapshot: ModelRunSnapshot): RunModelBindings {
  const service = getModelProviderService();
  return {
    snapshot,
    generateText: (messages, options) => service.generateText(messages, options, snapshot),
    generateJson: (messages, options) => service.generateJson(messages, options, snapshot),
    getModelsInfo: () => service.getModelsInfo(snapshot),
    createPlannerLLM: () => buildPlannerLLM(service, snapshot),
  };
}

/** @deprecated Use getModelsInfo via GET /api/models */
export function getProviderInfo(): ModelsInfo {
  return getModelProviderService().getModelsInfo();
}

export function getModelsInfo(): ModelsInfo {
  return getModelProviderService().getModelsInfo();
}

export function applyModelPreset(presetId: string): PublicModelsInfo {
  const meta = getPresetById(presetId);
  if (meta && meta.capability !== 'chat') {
    throw new Error(`预设「${meta.label}」为${meta.capability === 'image' ? '生图' : '视频'}模型，请通过 /api/media 使用`);
  }
  const preset = selectPresetConfig(presetId);

  runtimeConfig = {
    provider: preset.provider as ModelProviderType,
    model: preset.model,
    baseUrl: preset.baseUrl,
    apiKey: preset.apiKey,
    presetId,
    label: meta?.label,
    temperature: readTemperature(),
  };

  return getPublicModelsInfo();
}

export function updateRuntimeModelConfig(input: RuntimeModelConfigInput): PublicModelsInfo {
  if (input.presetId) {
    return applyModelPreset(input.presetId);
  }

  const nextProvider = input.provider ?? readProvider();
  if (
    nextProvider !== 'mock' &&
    nextProvider !== 'agnes' &&
    nextProvider !== 'openai' &&
    nextProvider !== 'deepseek' &&
    nextProvider !== 'zenmux' &&
    nextProvider !== 'custom'
  ) {
    throw new Error('Unsupported MODEL_PROVIDER');
  }

  const presetBaseUrl =
    nextProvider in PROVIDER_BASE_URLS
      ? PROVIDER_BASE_URLS[nextProvider as keyof typeof PROVIDER_BASE_URLS]
      : '';

  const defaultModel =
    nextProvider in PROVIDER_DEFAULT_MODELS
      ? PROVIDER_DEFAULT_MODELS[nextProvider as keyof typeof PROVIDER_DEFAULT_MODELS]
      : readModel();

  const nextKey =
    input.apiKey?.trim() || (nextProvider === 'mock' ? '' : readApiKeyForProvider(nextProvider));

  runtimeConfig = {
    provider: nextProvider,
    model: input.model?.trim() || defaultModel,
    baseUrl: input.baseUrl?.trim() || presetBaseUrl,
    temperature: Number.isFinite(Number(input.temperature))
      ? Math.min(Math.max(Number(input.temperature), 0), 2)
      : readTemperature(),
  };

  delete runtimeConfig.presetId;
  delete runtimeConfig.label;

  if (nextKey) {
    runtimeConfig.apiKey = nextKey;
  } else {
    delete runtimeConfig.apiKey;
  }

  return getPublicModelsInfo();
}

/** Apply default chat preset from catalog on server boot when env keys exist */
export function bootstrapDefaultModelFromCatalog(): void {
  if (hasRuntimeConfig()) return;
  const preset = getDefaultChatPreset();
  if (!preset) return;
  try {
    applyModelPreset(preset.id);
    logInfo(`bootstrapped model preset: ${preset.id}`);
  } catch {
    // keep env-based fallback
  }
}

export function resetRuntimeModelConfig(): PublicModelsInfo {
  runtimeConfig = {};
  return getPublicModelsInfo();
}

export async function testModelConnection(
  input?: RuntimeModelConfigInput,
): Promise<ModelTestResult> {
  const snapshot = input && Object.keys(input).length > 0 ? resolveInputSnapshot(input) : undefined;
  const info = snapshot ? getModelProviderService().getModelsInfo(snapshot) : getModelsInfo();
  const started = Date.now();

  if (info.usingMock) {
    return {
      ok: info.provider === 'mock',
      provider: 'mock',
      model: 'mock',
      latencyMs: Date.now() - started,
      message:
        info.provider === 'mock'
          ? 'Mock 模式：无需真实 API，将使用模板计划与演示内容'
          : '未配置 API Key，当前会降级为 Mock 模式',
      sample: 'OK',
      mocked: true,
    };
  }

  try {
    const result = await getModelProviderService().generateText(
      [
        {
          role: 'system',
          content: 'Reply with exactly one word: OK',
        },
        { role: 'user', content: 'ping' },
      ],
      { maxTokens: 16, temperature: 0 },
      snapshot,
    );

    if (result.mocked) {
      return {
        ok: false,
        provider: info.provider,
        model: info.model,
        latencyMs: Date.now() - started,
        message: '模型调用失败，已降级为 Mock（请检查 API Key、Base URL 与模型名）',
        mocked: true,
      };
    }

    return {
      ok: true,
      provider: info.provider,
      model: info.model,
      latencyMs: Date.now() - started,
      message: '连接成功',
      sample: result.content.trim().slice(0, 120),
      mocked: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      ok: false,
      provider: info.provider,
      model: info.model,
      latencyMs: Date.now() - started,
      message,
      mocked: false,
    };
  }
}

export const modelProviderService = {
  generateText: (messages: ModelMessage[], options?: GenerateOptions) =>
    getModelProviderService().generateText(messages, options),
  generateJson: <T = unknown>(messages: ModelMessage[], options?: GenerateOptions) =>
    getModelProviderService().generateJson<T>(messages, options),
  getModelsInfo: () => getModelProviderService().getModelsInfo(),
};
