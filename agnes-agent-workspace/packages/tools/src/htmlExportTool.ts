import type { AgentContext, ToolDefinition } from '@agnes/agent-core';
import type { HtmlExportOutput } from './types.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markdownToHtmlBody(markdown: string): string {
  const lines = markdown.split('\n');
  const parts: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      parts.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }
    if (trimmed.startsWith('# ')) {
      closeList();
      parts.push(`<h1>${escapeHtml(trimmed.slice(2))}</h1>`);
    } else if (trimmed.startsWith('## ')) {
      closeList();
      parts.push(`<h2>${escapeHtml(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith('### ')) {
      closeList();
      parts.push(`<h3>${escapeHtml(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('- ')) {
      if (!inList) {
        parts.push('<ul>');
        inList = true;
      }
      const item = trimmed
        .slice(2)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
      parts.push(`<li>${item}</li>`);
    } else {
      closeList();
      const para = trimmed
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
      parts.push(`<p>${para}</p>`);
    }
  }
  closeList();
  return parts.join('\n');
}

const THEMES = [
  { bg: '#f8fafc', paper: '#ffffff', ink: '#1e293b', heading: '#0f172a', accent: '#4f46e5', muted: '#64748b' },
  { bg: '#f6f8f3', paper: '#fffffb', ink: '#243328', heading: '#112018', accent: '#15803d', muted: '#66776a' },
  { bg: '#f7f3ef', paper: '#fffdf9', ink: '#34251d', heading: '#1f130d', accent: '#b45309', muted: '#7a6a5d' },
  { bg: '#f3f7fb', paper: '#ffffff', ink: '#203042', heading: '#0c1d2e', accent: '#0284c7', muted: '#617286' },
];

function themeForTitle(title: string) {
  const sum = [...title].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return THEMES[sum % THEMES.length];
}

function wrapHtmlDocument(title: string, body: string): string {
  const safeTitle = escapeHtml(title);
  const theme = themeForTitle(title);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      background: ${theme.bg};
      color: ${theme.ink};
      line-height: 1.7;
    }
    .report {
      max-width: 880px;
      margin: 0 auto;
      padding: 3rem clamp(1.25rem, 4vw, 3.25rem) 3.5rem;
      background: ${theme.paper};
      min-height: 100vh;
      box-shadow: 0 0 0 1px rgba(15, 23, 42, .08);
    }
    h1 {
      font-size: clamp(2rem, 5vw, 3.1rem);
      line-height: 1.08;
      font-weight: 700;
      border-bottom: 3px solid ${theme.accent};
      padding-bottom: 1rem;
      margin-bottom: 1.75rem;
      color: ${theme.heading};
    }
    h2 {
      font-size: 1.28rem;
      margin-top: 2.2rem;
      margin-bottom: 0.75rem;
      color: ${theme.heading};
    }
    h2::before { content: ""; display:inline-block; width:.55rem; height:.55rem; margin-right:.55rem; background:${theme.accent}; }
    h3 { font-size: 1.05rem; color: ${theme.muted}; }
    p { margin: 0.75rem 0; }
    ul { margin: 0.75rem 0; padding-left: 1.5rem; }
    li { margin: 0.35rem 0; }
    a { color: ${theme.accent}; text-decoration: none; }
    a:hover { text-decoration: underline; }
    hr {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 2rem 0;
    }
    footer {
      margin-top: 2rem;
      font-size: 0.85rem;
      color: ${theme.muted};
      text-align: center;
    }
  </style>
</head>
<body>
  <article class="report">
    ${body}
    <footer>Exported by Agnes Agent Workspace</footer>
  </article>
</body>
</html>`;
}

export const htmlExportTool: ToolDefinition = {
  name: 'html_export',
  description:
    'Convert Markdown research content into a complete, professionally styled HTML document for report preview.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Document title' },
      markdown: { type: 'string', description: 'Markdown body to render' },
    },
    required: ['title', 'markdown'],
  },
  async execute(input, _ctx: AgentContext) {
    const title = String(input.title ?? '').trim();
    const markdown = String(input.markdown ?? '').trim();

    if (!title) {
      return { success: false, output: null, error: 'html_export requires a title' };
    }
    if (!markdown) {
      return { success: false, output: null, error: 'html_export requires markdown content' };
    }

    const body = markdownToHtmlBody(markdown);
    const html = wrapHtmlDocument(title, body);
    const output: HtmlExportOutput = { html };

    return { success: true, output };
  },
};
