import type { Artifact } from './types.js';

export function isArtifact(value: unknown): value is Artifact {
  if (!value || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  return (
    typeof a.id === 'string' &&
    typeof a.type === 'string' &&
    typeof a.title === 'string' &&
    typeof a.content === 'string' &&
    typeof a.createdAt === 'string'
  );
}

/** Extract artifact from tool output without mutating context */
export function extractArtifact(output: unknown): Artifact | null {
  if (!output || typeof output !== 'object') return null;

  const record = output as Record<string, unknown>;
  if (isArtifact(record.artifact)) return record.artifact;
  if (isArtifact(record)) return record;

  return null;
}

/** Build artifact from standardized tool output shapes */
export function resolveArtifactFromOutput(
  toolName: string,
  output: unknown,
  fallbackTitle?: string,
): Artifact | null {
  const direct = extractArtifact(output);
  if (direct) return direct;

  if (!output || typeof output !== 'object') return null;
  const record = output as Record<string, unknown>;
  const now = new Date().toISOString();

  if (toolName === 'research_report' && typeof record.markdown === 'string') {
    return {
      id: crypto.randomUUID(),
      type: 'markdown',
      title: String(record.title ?? fallbackTitle ?? 'Research Report'),
      content: record.markdown,
      createdAt: now,
    };
  }

  if (toolName === 'document_generator' && typeof record.markdown === 'string') {
    return {
      id: crypto.randomUUID(),
      type: 'markdown',
      title: String(record.title ?? fallbackTitle ?? 'Generated Document'),
      content: record.markdown,
      createdAt: now,
    };
  }

  if (toolName === 'presentation_generator' && typeof record.html === 'string') {
    return {
      id: crypto.randomUUID(),
      type: 'html',
      title: String(record.title ?? fallbackTitle ?? 'Presentation Preview'),
      content: record.html,
      createdAt: now,
    };
  }

  if (toolName === 'html_export' && typeof record.html === 'string') {
    return {
      id: crypto.randomUUID(),
      type: 'html',
      title: String(fallbackTitle ?? 'Export'),
      content: record.html,
      createdAt: now,
    };
  }

  if (toolName === 'website_builder' && Array.isArray(record.files)) {
    const files = record.files as Array<{ path?: string; content?: string }>;
    const preview = files.find(
      (f) => f.path?.endsWith('.html') || f.path?.includes('preview'),
    );
    if (preview?.content) {
      return {
        id: crypto.randomUUID(),
        type: 'html',
        title: String(record.title ?? fallbackTitle ?? 'Website Preview'),
        content: preview.content,
        createdAt: now,
      };
    }
  }

  if (toolName === 'summary' && typeof record.summary === 'string') {
    return {
      id: crypto.randomUUID(),
      type: 'markdown',
      title: 'Execution Summary',
      content: record.summary,
      createdAt: now,
    };
  }

  if (toolName === 'image_generator' && typeof record.dataUrl === 'string') {
    return {
      id: crypto.randomUUID(),
      type: 'image',
      title: String(record.title ?? fallbackTitle ?? 'Generated Image'),
      content: record.dataUrl,
      createdAt: now,
    };
  }

  if (toolName === 'image_generator' && (typeof record.note === 'string' || typeof record.prompt === 'string')) {
    return {
      id: crypto.randomUUID(),
      type: 'markdown',
      title: String(record.title ?? fallbackTitle ?? 'Image Generation Status'),
      content: mediaStatusMarkdown(record),
      createdAt: now,
    };
  }

  if (toolName === 'video_generator' && typeof record.uri === 'string') {
    return {
      id: crypto.randomUUID(),
      type: 'video',
      title: String(record.title ?? fallbackTitle ?? 'Generated Video'),
      content: record.uri,
      createdAt: now,
    };
  }

  if (toolName === 'video_generator' && (typeof record.note === 'string' || typeof record.prompt === 'string')) {
    return {
      id: crypto.randomUUID(),
      type: 'markdown',
      title: String(record.title ?? fallbackTitle ?? 'Video Generation Status'),
      content: mediaStatusMarkdown(record),
      createdAt: now,
    };
  }

  return null;
}

function mediaStatusMarkdown(record: Record<string, unknown>): string {
  const title = typeof record.title === 'string' ? record.title : '媒体生成状态';
  const kind = typeof record.kind === 'string' ? record.kind : 'media';
  const model = typeof record.model === 'string' ? record.model : 'unknown';
  const prompt = typeof record.prompt === 'string' ? record.prompt : '';
  const note = typeof record.note === 'string' ? record.note : '生成任务没有返回可预览媒体。';
  return `# ${title}

## 状态
${note}

## 类型
${kind}

## 模型
${model}

## 使用的提示词
${prompt || '未记录提示词'}
`;
}
