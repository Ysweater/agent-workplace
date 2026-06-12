import type { AgentContext, ToolDefinition } from '@agnes/agent-core';
import type { SummaryOutput } from './types.js';

function extractTaskGoal(context: string): string {
  const taskLine = context.split('\n').find((l) => l.startsWith('Task:'));
  return taskLine?.replace(/^Task:\s*/, '').trim() || '未明确目标';
}

function extractToolNames(context: string): string[] {
  const matches = context.matchAll(/\[([a-z_]+)\]/g);
  return [...new Set([...matches].map((m) => m[1]))];
}

function extractArtifacts(context: string): string[] {
  const found: string[] = [];
  if (/markdown|research_report/i.test(context)) found.push('Markdown 调研报告');
  if (/document_generator/i.test(context)) found.push('结构化 Markdown 文档');
  if (/html_export|"html"/i.test(context)) found.push('HTML 预览页');
  if (/website_builder|PacmanGame|preview\/index\.html/i.test(context)) found.push('网站/游戏构建方案与代码片段');
  if (/image_generator|图片生成|Generated Image|data:image/i.test(context)) found.push('图片生成结果或提示词状态');
  if (/video_generator|视频生成|Generated Video/i.test(context)) found.push('视频生成任务状态');
  if (/web_search|sources/i.test(context)) found.push('检索来源列表');
  return found.length ? found : ['暂无明确产物'];
}

export const summaryTool: ToolDefinition = {
  name: 'summary',
  description:
    'Summarize the agent run: user goal, executed steps, tools used, final artifacts, and follow-up suggestions.',
  inputSchema: {
    type: 'object',
    properties: {
      context: { type: 'string', description: 'Accumulated run context (task, plan steps, tool outputs)' },
    },
    required: ['context'],
  },
  async execute(input, _ctx: AgentContext) {
    const context = String(input.context ?? '').trim();
    if (!context) {
      return { success: false, output: null, error: 'summary requires context' };
    }

    const goal = extractTaskGoal(context);
    const tools = extractToolNames(context);
    const artifacts = extractArtifacts(context);

    const stepsSection = tools.length
      ? tools.map((t, i) => `${i + 1}. 调用 \`${t}\``).join('\n')
      : '1. 未记录到具体工具步骤';

    const summary = `## 执行总结

### 用户目标
${goal}

### 执行步骤
${stepsSection}

### 调用工具
${tools.length ? tools.map((t) => `- ${t}`).join('\n') : '- 无'}

### 最终产物
${artifacts.map((a) => `- ${a}`).join('\n')}

### 后续建议
- 如需更深入分析，可补充真实检索 API 与模型 Provider
- 可在 Result Preview 中查看 HTML / Markdown 产物
- 对游戏类需求，可打开 preview/index.html 进行试玩
`;

    const output: SummaryOutput = { summary };
    return { success: true, output };
  },
};
