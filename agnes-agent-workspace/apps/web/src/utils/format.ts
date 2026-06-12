export function formatDurationMs(start?: string, end?: string): string {
  if (!start || !end) return '-';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function summarizeJson(value: unknown, max = 120): string {
  if (value === undefined || value === null) return '-';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

export function extractSummary(result: {
  finalResult?: unknown;
  artifacts?: Array<{ type: string; content: string }>;
}): string | null {
  const fr = result.finalResult;
  if (fr && typeof fr === 'object') {
    const record = fr as Record<string, unknown>;
    if (typeof record.answer === 'string') return record.answer;
    if (typeof record.summary === 'string') return record.summary;
    if (record.summary && typeof record.summary === 'object') {
      const nested = record.summary as Record<string, unknown>;
      if (typeof nested.summary === 'string') return nested.summary;
    }
  }

  const summaryArtifact = result.artifacts?.find(
    (a) =>
      a.type === 'markdown' &&
      (a.content.includes('执行总结') || a.content.includes('Execution summary')),
  );
  if (summaryArtifact) return summaryArtifact.content;

  const anyMarkdown = result.artifacts?.filter((a) => a.type === 'markdown').at(-1);
  if (anyMarkdown && anyMarkdown.content.length < 1200) return anyMarkdown.content;

  return null;
}
