export type ModelCapability = 'chat' | 'image' | 'video';
export type CatalogProvider = 'mock' | 'agnes' | 'openai' | 'deepseek' | 'zenmux' | 'custom';

export interface ModelPreset {
  id: string;
  label: string;
  description: string;
  provider: CatalogProvider;
  model: string;
  baseUrl: string;
  capability: ModelCapability;
  /** env var holding API key */
  envKey: string;
  default?: boolean;
}

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'agnes-15-flash',
    label: 'Agnes 1.5 Flash',
    description: 'Agnes API · 轻量低延迟对话 / 报告',
    provider: 'agnes',
    model: 'agnes-1.5-flash',
    baseUrl: 'https://apihub.agnes-ai.com/v1',
    capability: 'chat',
    envKey: 'AGNES_API_KEY',
  },
  {
    id: 'agnes-20-flash',
    label: 'Agnes 2.0 Flash',
    description: 'Agnes API · Agent / 工具调用 / 规划 / 报告',
    provider: 'agnes',
    model: 'agnes-2.0-flash',
    baseUrl: 'https://apihub.agnes-ai.com/v1',
    capability: 'chat',
    envKey: 'AGNES_API_KEY',
    default: true,
  },
  {
    id: 'agnes-image-20-flash',
    label: 'Agnes Image 2.0 Flash',
    description: 'Agnes API · 文生图 / 图生图 / 多图合成',
    provider: 'agnes',
    model: 'agnes-image-2.0-flash',
    baseUrl: 'https://apihub.agnes-ai.com',
    capability: 'image',
    envKey: 'AGNES_API_KEY',
  },
  {
    id: 'agnes-image-21-flash',
    label: 'Agnes Image 2.1 Flash',
    description: 'Agnes API · 高信息密度图像 / 文生图 / 图生图',
    provider: 'agnes',
    model: 'agnes-image-2.1-flash',
    baseUrl: 'https://apihub.agnes-ai.com',
    capability: 'image',
    envKey: 'AGNES_API_KEY',
  },
  {
    id: 'agnes-video-v20',
    label: 'Agnes Video v2.0',
    description: 'Agnes API · 文生视频 / 图生视频 / 关键帧动画',
    provider: 'agnes',
    model: 'agnes-video-v2.0',
    baseUrl: 'https://apihub.agnes-ai.com',
    capability: 'video',
    envKey: 'AGNES_API_KEY',
  },
  {
    id: 'deepseek-chat',
    label: 'DeepSeek Chat',
    description: 'DeepSeek 对话模型',
    provider: 'deepseek',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    capability: 'chat',
    envKey: 'DEEPSEEK_API_KEY',
  },
  {
    id: 'openai-gpt4o-mini',
    label: 'OpenAI GPT-4o mini',
    description: 'OpenAI 官方 API',
    provider: 'openai',
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
    capability: 'chat',
    envKey: 'OPENAI_API_KEY',
  },
  {
    id: 'zenmux-gemini-flash-image',
    label: 'ZenMux Gemini 3.1 Flash Image',
    description: 'ZenMux Vertex · 对话 + 生图',
    provider: 'zenmux',
    model: 'google/gemini-3.1-flash-image',
    baseUrl: 'https://zenmux.ai/api/vertex-ai',
    capability: 'chat',
    envKey: 'ZENMUX_API_KEY',
  },
  {
    id: 'zenmux-qwen-image',
    label: 'ZenMux Qwen Image 2.0',
    description: 'ZenMux · 文生图 / 改图',
    provider: 'zenmux',
    model: 'qwen/qwen-image-2.0',
    baseUrl: 'https://zenmux.ai/api/vertex-ai',
    capability: 'image',
    envKey: 'ZENMUX_API_KEY',
  },
  {
    id: 'zenmux-veo-video',
    label: 'ZenMux Veo 3.1 Fast',
    description: 'ZenMux · 文生视频',
    provider: 'zenmux',
    model: 'google/veo-3.1-fast-generate-001',
    baseUrl: 'https://zenmux.ai/api/vertex-ai',
    capability: 'video',
    envKey: 'ZENMUX_API_KEY',
  },
];

export function getPresetById(id: string): ModelPreset | undefined {
  return MODEL_PRESETS.find((p) => p.id === id);
}

export function readEnvKey(envKey: string): string {
  return process.env[envKey]?.trim() ?? '';
}

export function resolvePresetApiKey(preset: ModelPreset): string {
  const direct = readEnvKey(preset.envKey);
  if (direct) return direct;
  if (preset.provider === 'agnes') {
    return readEnvKey('MODEL_API_KEY');
  }
  return '';
}

export function listPresetsWithKeys(): ModelPreset[] {
  return MODEL_PRESETS.filter((p) => resolvePresetApiKey(p));
}
