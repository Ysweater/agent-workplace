export type PlannerTaskType =
  | 'research'
  | 'website'
  | 'writing'
  | 'analysis'
  | 'presentation'
  | 'media'
  | 'summary'
  | 'general';

export interface ConversationTurnLike {
  role: 'user' | 'assistant';
  content: string;
}

export interface PlannerPromptOptions {
  taskType?: PlannerTaskType;
  availableTools?: string[];
  userInput?: string;
  conversationHistory?: ConversationTurnLike[];
}

const TOOL_CHAIN_HINTS: Record<PlannerTaskType, string> = {
  research:
    'research: web_search -> research_report -> html_export -> summary. Use sources before writing claims.',
  website:
    'website: website_builder -> summary. Generate preview/index.html and files for the artifact workspace.',
  writing:
    'writing: document_generator -> html_export -> summary. Produce a structured Markdown deliverable.',
  analysis:
    'analysis: document_generator -> html_export -> summary. Extract findings, risks, and recommendations.',
  presentation:
    'presentation: presentation_generator -> summary. Produce slide JSON/Markdown and an HTML deck preview.',
  media:
    'media: prompt_enhancer -> image_generator/video_generator -> summary. If the user asks for both image and video, call both image_generator and video_generator after prompt_enhancer. Never call media generation before prompt_enhancer.',
  summary: 'summary: summary only.',
  general: 'general: choose the smallest registered tool chain that satisfies the task.',
};

function formatHistory(turns: ConversationTurnLike[] | undefined): string {
  if (!turns?.length) return '';
  const recent = turns.slice(-6);
  const lines = recent.map((t) => `${t.role === 'user' ? '用户' : '助手'}: ${t.content}`);
  return `\n\n近期会话上下文（供规划参考）：\n${lines.join('\n')}\n`;
}

export function buildPlannerPrompt(options: PlannerPromptOptions = {}): string {
  const { taskType = 'general', availableTools = [], userInput = '', conversationHistory } = options;
  const registeredTools =
    availableTools.length > 0
      ? availableTools.join(', ')
      : [
          'web_search',
          'research_report',
          'html_export',
          'website_builder',
          'document_generator',
          'presentation_generator',
          'prompt_enhancer',
          'image_generator',
          'video_generator',
          'summary',
        ].join(', ');

  return `你是 Agnes Agent Workspace 的任务规划器（Planner）。

职责：
把用户任务拆成少量、可执行、可观察的工具步骤。每一步必须映射到一个已注册工具。

用户任务：
${userInput || '（未提供）'}${formatHistory(conversationHistory)}

任务类型：
${taskType}

推荐工具链：
${TOOL_CHAIN_HINTS[taskType]}

已注册工具：
${registeredTools}

输出要求：
只输出 JSON 数组，不要 Markdown，不要解释，不要代码块。

数组元素结构：
{
  "stepId": "step-1",
  "title": "简短步骤标题",
  "toolName": "registered_tool_name",
  "reason": "为什么需要这一步",
  "expectedOutput": "这一步应该产出什么"
}

规划规则：
1. toolName 必须来自已注册工具列表。
2. research 必须先获得 sources，再写报告。
3. website 至少包含 website_builder。
4. presentation 优先使用 presentation_generator，而不是普通 document_generator。
5. media 必须先使用 prompt_enhancer，再调用 image_generator 或 video_generator；如果用户同时要图片和视频，两个生成工具都要规划。
6. 不要规划不存在的浏览器、文件系统、数据库或外部服务能力。
7. 步骤数量保持克制：普通任务 1-3 步，复杂任务 3-5 步。`;
}
