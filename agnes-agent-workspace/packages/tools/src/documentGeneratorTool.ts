import type { AgentContext, AgentTaskType, ToolDefinition } from '@agnes/agent-core';
import type { DocumentGeneratorOutput } from './types.js';

const MODE_LABELS: Record<DocumentGeneratorOutput['mode'], string> = {
  writing: '写作交付稿',
  analysis: '分析报告',
  presentation: '演示稿大纲',
};

function normalizeMode(taskType: AgentTaskType): DocumentGeneratorOutput['mode'] {
  if (taskType === 'analysis') return 'analysis';
  if (taskType === 'presentation') return 'presentation';
  return 'writing';
}

function buildSystemPrompt(mode: DocumentGeneratorOutput['mode']): string {
  const sharedRules = `你是 Agnes Agent Workspace 的文档生成工具。
你必须基于用户任务生成可交付的 Markdown 文档，不要编造未给出的事实、数字、来源或承诺。
如果用户没有提供足够背景，用“待补充”标记，不要假装已经确认。
输出必须是完整 Markdown，不能包含代码块围栏，不能解释你如何思考。`;

  if (mode === 'analysis') {
    return `${sharedRules}
分析类文档必须包含：结论摘要、关键发现、依据与假设、风险/不确定性、建议动作。`;
  }

  if (mode === 'presentation') {
    return `${sharedRules}
演示稿大纲必须包含：叙事主线、目标听众、逐页幻灯片标题、每页要点、建议视觉呈现、收尾行动。`;
  }

  return `${sharedRules}
写作类文档必须根据用户意图选择合适格式，例如文案、方案、邮件、PRD、公告或提案；必须包含标题、正文结构和可执行下一步。`;
}

function buildUserPrompt(
  task: string,
  mode: DocumentGeneratorOutput['mode'],
  conversationContext: string,
): string {
  return `任务类型：${mode}
${conversationContext ? `会话上下文：\n${conversationContext}\n\n` : ''}
用户任务：
${task}

请生成一份结构严谨、可直接放入产物区预览的 Markdown 文档。
如果用户说“基于刚才”“继续”“改成”“再生成”，必须结合会话上下文中的上一轮产物和用户反馈。`;
}

function buildFallbackMarkdown(task: string, mode: DocumentGeneratorOutput['mode']): string {
  if (mode === 'analysis') {
    return `# ${MODE_LABELS[mode]}：${task}

## 结论摘要
当前输入适合进一步拆解为目标、材料、判断标准和建议动作。由于尚未接入外部数据或用户未提供完整材料，以下内容以任务描述为边界。

## 关键发现
- 目标主题：${task}
- 可确认信息：来自用户输入本身
- 待补充信息：数据来源、时间范围、评价标准、目标受众

## 依据与假设
- 依据：用户当前任务描述
- 假设：需要一份可阅读、可追踪、可继续完善的分析产物

## 风险与不确定性
- 若缺少原始材料，分析结论只能作为框架草案
- 若涉及业务数据，需要补充数据口径和来源

## 建议动作
- 补充原始材料或数据
- 明确分析目标和决策场景
- 基于补充信息生成第二版分析`;
  }

  if (mode === 'presentation') {
    return `# ${MODE_LABELS[mode]}：${task}

## 叙事主线
围绕“背景问题 → 关键洞察 → 方案路径 → 行动建议”展开。

## 目标听众
- 待补充：管理层、客户、团队成员或评审方

## 幻灯片结构
### 1. 标题页
- 主题：${task}
- 副标题：待补充

### 2. 背景与问题
- 当前情境
- 为什么现在需要讨论

### 3. 关键洞察
- 核心判断
- 支撑依据

### 4. 方案路径
- 主要方案
- 实施步骤

### 5. 风险与应对
- 关键风险
- 缓解方式

### 6. 下一步行动
- 明确负责人、时间点和交付物

## 建议视觉呈现
- 使用流程图、对比表和路线图增强可读性`;
  }

  return `# ${MODE_LABELS[mode]}：${task}

## 目标
围绕用户任务“${task}”形成一份可继续编辑的结构化草稿。

## 核心信息
- 目标对象：待补充
- 使用场景：待补充
- 关键诉求：待补充

## 正文草稿
请在这里补充具体背景、产品信息、受众画像或业务目标。当前版本先提供可落地的结构：

1. 开场：说明背景和目标
2. 主体：展开核心卖点、方案或需求
3. 收束：明确下一步行动

## 可执行下一步
- 补充目标受众和语气要求
- 明确交付格式：文案、邮件、PRD、方案或公告
- 提供必要事实材料后生成精修版本`;
}

function titleFromTask(task: string, mode: DocumentGeneratorOutput['mode']): string {
  const compact = task.replace(/\s+/g, ' ').trim();
  return `${MODE_LABELS[mode]}：${compact.slice(0, 36) || '未命名任务'}`;
}

export const documentGeneratorTool: ToolDefinition = {
  name: 'document_generator',
  description:
    'Generate structured Markdown deliverables for writing, analysis, and presentation-outline tasks.',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'User task or writing requirement' },
      taskType: {
        type: 'string',
        enum: ['writing', 'analysis', 'presentation'],
        description: 'Document task type',
      },
    },
    required: ['task', 'taskType'],
  },
  async execute(input, ctx: AgentContext, services) {
    const task = String(input.task ?? ctx.task.userInput ?? '').trim();
    const taskType = String(input.taskType ?? ctx.task.taskType) as AgentTaskType;
    const conversationContext = String(input.conversationContext ?? '').trim();
    const mode = normalizeMode(taskType);

    if (!task) {
      return { success: false, output: null, error: 'document_generator requires a task' };
    }

    let markdown = '';
    if (services?.generateText) {
      markdown = await services.generateText(
        [
          { role: 'system', content: buildSystemPrompt(mode) },
          { role: 'user', content: buildUserPrompt(task, mode, conversationContext) },
        ],
        { maxTokens: 1800, temperature: 0.2 },
      );
    }

    const output: DocumentGeneratorOutput = {
      title: titleFromTask(task, mode),
      markdown: markdown.trim() || buildFallbackMarkdown(task, mode),
      mode,
    };

    return { success: true, output };
  },
};
