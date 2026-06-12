import type { AgentContext, ToolDefinition } from '@agnes/agent-core';
import type { PromptEnhancerOutput } from './types.js';

function fallbackPrompt(task: string, target: string): PromptEnhancerOutput {
  const enhancedPrompt = [
    `Goal: ${task}`,
    `Medium: ${target === 'media' ? 'high-quality image or video AIGC' : target}`,
    'Subject: define the main object, scene, action, mood, and intended message.',
    'Style: modern, polished, coherent, production-ready; avoid low-quality or messy elements.',
    'Composition: clear focal subject, layered foreground/midground/background, demo-friendly framing.',
    'Lighting: natural soft light, high dynamic range, rich but controlled details.',
    'Quality constraints: sharp, clean, no distorted anatomy, no garbled text, no extra watermark.',
    'Negative prompt: low resolution, blurry, deformed hands, duplicated objects, chaotic background, unreadable typography.',
  ].join('\n');

  return {
    originalPrompt: task,
    enhancedPrompt,
    target,
    rationale: [
      'Expanded the raw user idea into subject, scene, style, composition, lighting, and quality constraints.',
      'Converted a short request into a production-ready AIGC prompt before media generation.',
      'Preserved user intent while reducing uncontrolled model drift.',
    ],
  };
}

export const promptEnhancerTool: ToolDefinition = {
  name: 'prompt_enhancer',
  description:
    'Enhance a user request into a production-ready prompt before calling AIGC or generation tools.',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'Original user request' },
      target: { type: 'string', description: 'Target generation type' },
    },
    required: ['task', 'target'],
  },
  async execute(input, ctx: AgentContext, services) {
    const task = String(input.task ?? ctx.task.userInput ?? '').trim();
    const target = String(input.target ?? ctx.task.taskType ?? 'media').trim();
    if (!task) {
      return { success: false, output: null, error: 'prompt_enhancer requires a task' };
    }

    if (services?.generateText) {
      try {
        const content = await services.generateText(
          [
            {
              role: 'system',
              content:
                'You are an AIGC prompt engineer. Rewrite the user request into a production-ready image/video generation prompt. Include subject, scene, style, composition, camera, lighting, quality constraints, and negative constraints. Output only the optimized prompt text.',
            },
            {
              role: 'user',
              content: `Generation target: ${target}\nOriginal user request: ${task}`,
            },
          ],
          { temperature: 0.3, maxTokens: 1200 },
        );
        const enhancedPrompt = content.trim();
        if (enhancedPrompt) {
          const output: PromptEnhancerOutput = {
            originalPrompt: task,
            enhancedPrompt,
            target,
            rationale: [
              'Model expanded the prompt before generation.',
              'The generated prompt adds structure and constraints while preserving intent.',
            ],
          };
          return { success: true, output };
        }
      } catch {
        // Fall back to deterministic prompt engineering.
      }
    }

    return { success: true, output: fallbackPrompt(task, target) };
  },
};
