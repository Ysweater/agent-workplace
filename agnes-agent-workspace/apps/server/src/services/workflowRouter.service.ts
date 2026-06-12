import type { AgentTaskType, ConversationTurn, RouteDecision } from '@agnes/agent-core';
import { classifyTaskType } from '@agnes/agent-core';

const WORKFLOW_BY_TYPE: Record<AgentTaskType, string> = {
  research: 'researchWorkflow',
  website: 'websiteWorkflow',
  writing: 'writingWorkflow',
  analysis: 'analysisWorkflow',
  presentation: 'presentationWorkflow',
  media: 'mediaWorkflow',
  summary: 'summaryWorkflow',
};

const KEYWORDS: Record<Exclude<AgentTaskType, 'summary'>, string[]> = {
  research: [
    '\u8c03\u7814',
    '\u7814\u7a76\u62a5\u544a',
    '\u884c\u4e1a\u5206\u6790',
    '\u5e02\u573a\u62a5\u544a',
    '\u8d44\u6599\u68c0\u7d22',
    '\u641c\u7d22',
    'research',
    'report',
  ],
  website: [
    '\u7f51\u7ad9',
    '\u5b98\u7f51',
    '\u843d\u5730\u9875',
    '\u9875\u9762',
    '\u5efa\u7ad9',
    '\u5c0f\u6e38\u620f',
    '\u6e38\u620f',
    '\u5403\u8c46\u4eba',
    'pacman',
    'website',
    'landing',
    'homepage',
    'game',
  ],
  presentation: [
    'PPT',
    '\u6f14\u793a\u7a3f',
    '\u5e7b\u706f\u7247',
    '\u8def\u6f14',
    '\u6c47\u62a5',
    'presentation',
    'slides',
    'deck',
  ],
  media: [
    '\u751f\u56fe',
    '\u751f\u6210\u56fe',
    '\u753b\u56fe',
    '\u753b\u4e00\u5f20',
    '\u753b\u4e00\u4e2a',
    '\u56fe\u7247',
    '\u6d77\u62a5',
    '\u89c6\u9891',
    '\u77ed\u7247',
    'AIGC',
    '\u6587\u751f\u56fe',
    '\u6587\u751f\u89c6\u9891',
    'image',
    'poster',
    'video',
  ],
  writing: [
    '\u6587\u6848',
    '\u65b9\u6848',
    '\u90ae\u4ef6',
    'PRD',
    '\u516c\u544a',
    '\u63d0\u7eb2',
    'writing',
    'copy',
    'email',
  ],
  analysis: [
    '\u5206\u6790',
    '\u590d\u76d8',
    '\u6d1e\u5bdf',
    '\u5bf9\u6bd4',
    '\u8bc4\u4f30',
    'analysis',
    'compare',
    'evaluate',
  ],
};

const ROUTE_ORDER: Array<Exclude<AgentTaskType, 'summary'>> = [
  'research',
  'website',
  'presentation',
  'media',
  'writing',
  'analysis',
];

const SIGNAL_LABEL: Record<Exclude<AgentTaskType, 'summary'>, string> = {
  research: 'research keywords',
  website: 'website keywords',
  presentation: 'presentation keywords',
  media: 'media keywords',
  writing: 'writing keywords',
  analysis: 'analysis keywords',
};

function hasKeyword(input: string, taskType: Exclude<AgentTaskType, 'summary'>): boolean {
  const normalized = input.toLowerCase();
  return KEYWORDS[taskType].some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function detectIntent(
  input: string,
  explicitType?: AgentTaskType,
  conversationHistory: ConversationTurn[] = [],
): AgentTaskType {
  if (explicitType) return explicitType;

  for (const taskType of ROUTE_ORDER) {
    if (hasKeyword(input, taskType)) return taskType;
  }

  if (isContinuationRequest(input)) {
    const recent = conversationHistory
      .slice(-8)
      .map((turn) => turn.content)
      .join('\n');
    for (const taskType of ROUTE_ORDER) {
      if (hasKeyword(recent, taskType)) return taskType;
    }
  }

  return classifyTaskType(input);
}

function collectSignals(input: string, intent: AgentTaskType, explicitType?: AgentTaskType): string[] {
  if (explicitType) return [`explicit ${explicitType}`];

  const signals = ROUTE_ORDER
    .filter((taskType) => hasKeyword(input, taskType))
    .map((taskType) => SIGNAL_LABEL[taskType]);

  if (signals.length > 0) return signals;
  return [`fallback ${intent} intent`];
}

export function routeAgentTask(
  userInput: string,
  explicitType?: AgentTaskType,
  conversationHistory: ConversationTurn[] = [],
): RouteDecision {
  const intent = detectIntent(userInput, explicitType, conversationHistory);
  const signals = collectSignals(userInput, intent, explicitType);
  const workflowName = WORKFLOW_BY_TYPE[intent];
  const confidence = explicitType ? 0.95 : signals.length > 1 ? 0.86 : 0.74;

  return {
    intent,
    workflowName,
    confidence,
    signals,
    reason: explicitType
      ? `User explicitly selected ${explicitType}; main agent routes to ${workflowName}.`
      : `Main agent routes to ${workflowName} by keywords, product type, and task complexity.`,
  };
}

function isContinuationRequest(input: string): boolean {
  return /重新|再|继续|基于刚才|展示给我|给我看|换一版|改成|优化|重新生成|regenerate|again|continue/i.test(
    input,
  );
}

export function buildImmediateAgentReply(route: RouteDecision): string {
  const nameMap: Record<string, string> = {
    researchWorkflow: '\u68c0\u7d22\u8d44\u6599\u5e76\u751f\u6210\u5206\u6790\u62a5\u544a',
    websiteWorkflow: '\u751f\u6210\u53ef\u9884\u89c8\u7684\u7f51\u7ad9\u6216\u9875\u9762',
    writingWorkflow: '\u6574\u7406\u6210\u7ed3\u6784\u5316\u6587\u6863',
    analysisWorkflow: '\u5b8c\u6210\u5206\u6790\u4e0e\u5efa\u8bae\u5f52\u7eb3',
    presentationWorkflow: '\u751f\u6210\u6f14\u793a\u7a3f\u7ed3\u6784\u4e0e\u9884\u89c8',
    mediaWorkflow: '\u5148\u4f18\u5316\u63d0\u793a\u8bcd\uff0c\u518d\u751f\u6210\u56fe\u7247\u6216\u89c6\u9891',
    summaryWorkflow: '\u6574\u7406\u5e76\u603b\u7ed3\u4f60\u7684\u95ee\u9898',
  };

  return `\u5df2\u6536\u5230\uff0c\u6211\u4f1a\u6309\u300c${nameMap[route.workflowName] ?? route.workflowName}\u300d\u5904\u7406\u3002\u8def\u7531\u4f9d\u636e\uff1a${route.signals.join('\u3001')}\u3002`;
}
