export interface PreviewFile {
  path: string;
  content: string;
}

export interface LocalPreviewOffer {
  title: string;
  html: string;
  blocked: boolean;
  devUrl?: string;
}

/** 在新浏览器窗口 / 标签页打开 HTML，作为本地可交互页面 */
export function openHtmlInNewWindow(html: string, title = 'Agnes 预览'): boolean {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const features = 'noopener,noreferrer,width=1280,height=840';
  const win = window.open(url, '_blank', features);

  if (!win) {
    URL.revokeObjectURL(url);
    return false;
  }

  try {
    win.document.title = title;
  } catch {
    // cross-origin not applicable for blob; ignore
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  return true;
}

export function downloadTextFile(content: string, filename: string, mime = 'text/html;charset=utf-8'): void {
  const safeName = filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\//g, '_') || 'preview.html';
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** 下载主预览 HTML；若存在多文件则依次下载（浏览器可能提示允许多次下载） */
export function downloadPreviewBundle(files: PreviewFile[], preferredPath = 'preview/index.html'): void {
  const main =
    files.find((f) => f.path === preferredPath || f.path.endsWith(preferredPath)) ??
    files.find((f) => f.path.endsWith('.html'));

  if (main) {
    downloadTextFile(main.content, main.path.split('/').pop() ?? 'index.html');
  }

  for (const file of files) {
    if (file === main) continue;
    const ext = file.path.split('.').pop()?.toLowerCase();
    const mime =
      ext === 'html' ? 'text/html;charset=utf-8' :
      ext === 'css' ? 'text/css;charset=utf-8' :
      ext === 'js' ? 'text/javascript;charset=utf-8' :
      'text/plain;charset=utf-8';
    downloadTextFile(file.content, file.path.split('/').pop() ?? 'file.txt', mime);
  }
}

export function slugifyFilename(title: string): string {
  const trimmed = title.trim().slice(0, 40);
  if (/[\u4e00-\u9fff]/.test(trimmed)) {
    return trimmed.replace(/\s+/g, '-') || 'agnes-preview';
  }
  return trimmed.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'agnes-preview';
}
