import type { Artifact } from '../types/agent';
import type { PreviewFile } from './preview';

export interface WebsiteOutput {
  title?: string;
  description?: string;
  previewNotes?: string;
  projectDir?: string;
  devUrl?: string;
  launchStatus?: string;
  launchMessage?: string;
  scaffoldType?: string;
  files?: Array<PreviewFile & { language?: string }>;
}

export function parseWebsiteOutput(value: unknown): WebsiteOutput | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as WebsiteOutput;
  if (!record.files?.length) return null;
  return record;
}

export function getWebsitePreviewHtml(website: WebsiteOutput): string | null {
  const preferred = website.files?.find(
    (f) => f.path === 'preview/index.html' || f.path.endsWith('preview/index.html'),
  );
  if (preferred?.content) return preferred.content;
  const anyHtml = website.files?.find((f) => f.path.endsWith('.html'));
  return anyHtml?.content ?? null;
}

export function resolvePreviewFromRun(
  artifacts: Artifact[],
  websiteOutput?: unknown,
): { html: string | null; title: string; files?: PreviewFile[]; kind: 'website' | 'html' | null } {
  const website = parseWebsiteOutput(websiteOutput);
  const websiteHtml = website ? getWebsitePreviewHtml(website) : null;

  if (websiteHtml) {
    return {
      html: websiteHtml,
      title: website?.title ?? '网站 / 游戏预览',
      files: website?.files,
      kind: 'website',
    };
  }

  const htmlArtifact = artifacts.filter((a) => a.type === 'html').at(-1);
  if (htmlArtifact?.content) {
    return {
      html: htmlArtifact.content,
      title: htmlArtifact.title ?? 'HTML 报告预览',
      kind: 'html',
    };
  }

  return { html: null, title: '预览', kind: null };
}
