interface PreviewFullscreenModalProps {
  open: boolean;
  title: string;
  html: string;
  onClose: () => void;
}

export default function PreviewFullscreenModal({
  open,
  title,
  html,
  onClose,
}: PreviewFullscreenModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[var(--agnes-panel)] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-100">{title}</p>
          <p className="text-[11px] text-slate-500">全屏本地预览 · 可键盘操作试玩</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
        >
          关闭
        </button>
      </div>
      <div className="min-h-0 flex-1 bg-white p-2">
        <iframe
          title={title}
          srcDoc={html}
          className="h-full w-full rounded-lg border border-slate-200"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}
