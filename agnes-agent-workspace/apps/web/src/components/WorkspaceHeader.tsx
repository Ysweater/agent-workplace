import { useHealth } from '../hooks/useHealth';
import { useModels } from '../hooks/useModels';

export default function WorkspaceHeader() {
  const { health, connected } = useHealth();
  const { models } = useModels();

  const provider = models?.configured ? models.provider : 'mock';
  const model = models?.model ?? 'mock';

  return (
    <header className="shrink-0 border-b border-[var(--agnes-border-subtle)] bg-[var(--agnes-panel)]/80 px-4 py-2 backdrop-blur-sm sm:px-5">
      <div className="flex items-center justify-between gap-4">
        <p className="truncate text-xs text-slate-500">
          <span className="text-slate-400">Agnes Agent Workspace</span>
          <span className="mx-2 text-slate-700">·</span>
          任务工作台
        </p>

        <div className="flex shrink-0 items-center gap-2 text-[10px] text-slate-500">
          <span className="hidden sm:inline">{provider}</span>
          <span className="hidden text-slate-700 sm:inline">/</span>
          <span className="max-w-[100px] truncate" title={model}>
            {model}
          </span>
          <span
            className={`ml-1 h-1.5 w-1.5 rounded-full ${
              connected ? 'bg-emerald-500/80' : 'bg-red-500/80'
            }`}
            title={connected ? '服务已连接' : '服务离线'}
          />
          {health?.storage && (
            <span className="hidden text-slate-600 md:inline">
              · {health.storage.driver}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
