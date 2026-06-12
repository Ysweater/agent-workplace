import { useState } from 'react';
import {
  downloadPreviewBundle,
  downloadTextFile,
  openHtmlInNewWindow,
  slugifyFilename,
  type PreviewFile,
} from '../utils/preview';
import PreviewFullscreenModal from './PreviewFullscreenModal';

interface PreviewActionsProps {
  html: string;
  title: string;
  files?: PreviewFile[];
  devUrl?: string;
  projectDir?: string;
  compact?: boolean;
  className?: string;
}

export default function PreviewActions({
  html,
  title,
  files,
  devUrl,
  projectDir,
  compact = false,
  className = '',
}: PreviewActionsProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2800);
  };

  const handleOpenWindow = () => {
    const ok = openHtmlInNewWindow(html, title);
    showNotice(ok ? '已在新窗口打开本地预览' : '浏览器拦截了弹窗，请允许弹窗后重试');
  };

  const handleDownload = () => {
    if (files && files.length > 0) {
      downloadPreviewBundle(files);
      showNotice('已开始下载预览文件');
      return;
    }
    downloadTextFile(html, `${slugifyFilename(title)}.html`);
    showNotice('已下载 HTML 文件，双击即可本地打开');
  };

  const btnClass = compact
    ? 'rounded-lg border border-[var(--agnes-border-subtle)] px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-indigo-500/40 hover:text-white'
    : 'rounded-lg border border-[var(--agnes-border-subtle)] bg-white/[0.03] px-3 py-1.5 text-xs text-slate-200 transition hover:border-indigo-500/40 hover:bg-indigo-500/10';

  return (
    <>
      <div className={`flex flex-wrap items-center gap-2 ${className}`}>
        <button type="button" onClick={handleOpenWindow} className={btnClass}>
          新窗口打开
        </button>
        <button type="button" onClick={() => setFullscreen(true)} className={btnClass}>
          全屏预览
        </button>
        <button type="button" onClick={handleDownload} className={btnClass}>
          下载到本地
        </button>
        {devUrl && (
          <a
            href={devUrl}
            target="_blank"
            rel="noreferrer"
            className={btnClass}
          >
            打开本地 Vite 站点
          </a>
        )}
        {notice && <span className="text-[11px] text-emerald-400">{notice}</span>}
        {projectDir && (
          <p className="w-full truncate text-[10px] text-slate-600" title={projectDir}>
            项目目录：{projectDir}
          </p>
        )}
      </div>

      <PreviewFullscreenModal
        open={fullscreen}
        title={title}
        html={html}
        onClose={() => setFullscreen(false)}
      />
    </>
  );
}
