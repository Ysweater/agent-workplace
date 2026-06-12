import type { AgentContext, ToolDefinition } from '@agnes/agent-core';
import type { PromptEnhancerOutput } from './types.js';

function fallbackPrompt(task: string, target: string): PromptEnhancerOutput {
  if (target !== 'media') {
    const targetLabels: Record<string, string> = {
      research: 'research report',
      website: 'website or interactive preview',
      writing: 'structured writing deliverable',
      analysis: 'analysis deliverable',
      presentation: 'presentation deck',
      summary: 'summary',
    };
    const targetLabel = targetLabels[target] ?? target;

    const enhancedPrompt = [
      `Goal: ${task}`,
      `Target artifact: ${targetLabel}`,
      'Audience: infer the likely reviewers and keep the output demo-ready.',
      'Structure: define sections, narrative order, expected components, and acceptance criteria before generation.',
      'Style: professional, coherent, concise, visually presentable, and suitable for Agnes Agent Workspace preview.',
      'Constraints: preserve the user intent, do not invent unavailable facts, mark assumptions clearly, and include follow-up suggestions.',
      'Output requirements: produce a complete artifact with enough detail for tool execution and preview.',
    ].join('\n');

    return {
      originalPrompt: task,
      enhancedPrompt,
      target,
      rationale: [
        'Expanded the raw request into a structured production brief before generation.',
        'Added audience, structure, style, constraints, and output requirements.',
        'Prevents direct pass-through of the original user wording to downstream generation tools.',
      ],
    };
  }

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
                target === 'media'
                  ? 'You are an AIGC prompt engineer. Rewrite the user request into a production-ready image/video generation prompt. Include subject, scene, style, composition, camera, lighting, quality constraints, and negative constraints. Output only the optimized prompt text.'
                  : 'You are the prompt optimizer inside Agnes Agent Workspace. Rewrite the raw user request into a structured production brief before any generation tool runs. Include goal, audience, artifact structure, style constraints, factual boundaries, acceptance criteria, and preview requirements. Output only the optimized brief text.',
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
