import type { AgentContext, ToolDefinition } from '@agnes/agent-core';
import type { MediaGenerationOutput } from './types.js';

function titleFromPrompt(prompt: string, kind: 'image' | 'video'): string {
  const compact = prompt.replace(/\s+/g, ' ').trim();
  return `${kind === 'image' ? '图片生成' : '视频生成'}：${compact.slice(0, 32) || '未命名'}`;
}

export const imageGeneratorTool: ToolDefinition = {
  name: 'image_generator',
  description: 'Generate an image artifact from an enhanced prompt.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Enhanced image generation prompt' },
      model: { type: 'string', description: 'Optional image model name' },
    },
    required: ['prompt'],
  },
  async execute(input, ctx: AgentContext, services) {
    const prompt = String(input.prompt ?? '').trim();
    const model = typeof input.model === 'string' ? input.model : undefined;
    if (!prompt) {
      return { success: false, output: null, error: 'image_generator requires a prompt' };
    }

    if (!services?.generateImage) {
      const output: MediaGenerationOutput = {
        title: titleFromPrompt(prompt, 'image'),
        kind: 'image',
        prompt,
        model: model ?? 'not-configured',
        uri: '',
      };
      return {
        success: true,
        output: {
          ...output,
          note: '图片生成服务未配置；已保留增强后的提示词，演示时可接入 ZenMux 图片模型。',
        },
      };
    }

    try {
      const result = await services.generateImage(prompt, { model });
      const output: MediaGenerationOutput = {
        title: titleFromPrompt(ctx.task.userInput, 'image'),
        kind: 'image',
        prompt,
        model: result.model,
        mimeType: result.mimeType,
        dataUrl: `data:${result.mimeType};base64,${result.base64}`,
        ...(result.uri ? { uri: result.uri } : {}),
      };
      return { success: true, output };
    } catch (err) {
      return {
        success: true,
        output: {
          title: titleFromPrompt(ctx.task.userInput, 'image'),
          kind: 'image',
          prompt,
          model: model ?? 'image-provider-unavailable',
          note:
            err instanceof Error
              ? `图片生成未完成：${err.message}`
              : '图片生成未完成：生成服务不可用',
        },
      };
    }
  },
};

export const videoGeneratorTool: ToolDefinition = {
  name: 'video_generator',
  description: 'Submit a video generation task from an enhanced prompt.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Enhanced video generation prompt' },
      model: { type: 'string', description: 'Optional video model name' },
    },
    required: ['prompt'],
  },
  async execute(input, ctx: AgentContext, services) {
    const prompt = String(input.prompt ?? '').trim();
    const model = typeof input.model === 'string' ? input.model : undefined;
    if (!prompt) {
      return { success: false, output: null, error: 'video_generator requires a prompt' };
    }

    if (!services?.generateVideo) {
      const output: MediaGenerationOutput = {
        title: titleFromPrompt(prompt, 'video'),
        kind: 'video',
        prompt,
        model: model ?? 'not-configured',
        submitted: false,
        done: false,
      };
      return {
        success: true,
        output: {
          ...output,
          note: '视频生成服务未配置；已保留增强后的提示词，演示时可接入 ZenMux 视频模型。',
        },
      };
    }

    try {
      const result = await services.generateVideo(prompt, { model });
      const output: MediaGenerationOutput = {
        title: titleFromPrompt(ctx.task.userInput, 'video'),
        kind: 'video',
        prompt,
        model: result.model,
        ...(result.uri ? { uri: result.uri } : {}),
        done: result.done,
        submitted: result.submitted,
      };
      return { success: true, output };
    } catch (err) {
      return {
        success: true,
        output: {
          title: titleFromPrompt(ctx.task.userInput, 'video'),
          kind: 'video',
          prompt,
          model: model ?? 'video-provider-unavailable',
          done: false,
          submitted: false,
          note:
            err instanceof Error
              ? `视频生成未完成：${err.message}`
              : '视频生成未完成：生成服务不可用',
        },
      };
    }
  },
};
