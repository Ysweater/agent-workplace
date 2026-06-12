import type { AgentStepStatus } from '../types/agent';

export const STEP_STATUS_ZH: Record<AgentStepStatus, string> = {
  pending: '等待',
  running: '执行中',
  success: '完成',
  error: '失败',
};

export const TASK_TYPE_ZH: Record<string, string> = {
  chat: '正常对话',
  research: '检索分析报告',
  website: '一键建站',
  writing: '文档写作',
  analysis: '分析任务',
  presentation: 'PPT 生成',
  media: '图片 / 视频 AIGC',
  summary: '任务总结',
};

export const RUN_STATUS_ZH: Record<string, string> = {
  queued: '排队中',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
};

export function taskTypeLabel(taskType?: string): string {
  if (!taskType) return 'Agent 任务';
  return TASK_TYPE_ZH[taskType] ?? taskType;
}
