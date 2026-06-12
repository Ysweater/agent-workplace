import type { ToolCallRecord } from '../types/agent';

export function summarizeToolOutput(call: ToolCallRecord): string {
  if (call.error) return call.error;
  if (!call.success && !call.completedAt) return '正在执行…';

  const out = call.output;
  if (!out || typeof out !== 'object') return '执行完成';

  const record = out as Record<string, unknown>;

  if (typeof record.summary === 'string') {
    const text = record.summary.replace(/\s+/g, ' ').trim();
    return text.length > 72 ? `${text.slice(0, 72)}…` : text;
  }
  if (Array.isArray(record.sources)) {
    return `检索到 ${record.sources.length} 条参考来源`;
  }
  if (typeof record.title === 'string' && typeof record.markdown === 'string') {
    return `报告：${record.title}`;
  }
  if (typeof record.html === 'string') {
    return '已导出 HTML 预览';
  }
  if (Array.isArray(record.files)) {
    return `已生成 ${record.files.length} 个文件`;
  }
  if (typeof record.title === 'string') {
    return record.title;
  }

  return '执行完成';
}
