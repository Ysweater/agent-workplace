import type { SessionListItem } from '../types/agent';
import { taskTypeLabel } from '../utils/status';

interface SidebarProps {
  loading: boolean;
  lastRunLabel?: string | null;
  sessions: SessionListItem[];
  loadingSessions?: boolean;
  historyError?: string | null;
  onNewTask: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (session: SessionListItem) => void;
}

export default function Sidebar({
  loading,
  lastRunLabel,
  sessions,
  loadingSessions,
  historyError,
  onNewTask,
  onSelectSession,
  onDeleteSession,
}: SidebarProps) {
  return (
    <aside className="hidden w-[220px] shrink-0 flex-col border-r border-[var(--agnes-border-subtle)] bg-[var(--agnes-sidebar)] lg:flex">
      <div className="border-b border-[var(--agnes-border-subtle)] px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-sm font-bold text-indigo-300">
            A
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">Agnes</p>
            <p className="truncate text-[10px] text-slate-500">Agent Workspace</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-3">
        <button
          type="button"
          onClick={onNewTask}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-200 transition hover:bg-indigo-500/20 disabled:opacity-50"
        >
          <span className="text-base leading-none">+</span>
          新任务
        </button>
      </div>

      <div className="min-h-0 flex-1 border-t border-[var(--agnes-border-subtle)] p-3">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-600">
            最近运行
          </p>
          {loadingSessions && <span className="text-[10px] text-slate-600">读取中</span>}
        </div>
        {historyError && (
          <p className="mb-2 rounded-lg bg-red-500/10 px-2 py-1.5 text-[10px] text-red-300">
            {historyError}
          </p>
        )}
        {sessions.length > 0 ? (
          <ul className="max-h-full space-y-1 overflow-y-auto pr-1">
            {sessions.map((session) => {
              const active = lastRunLabel === session.userInput;
              return (
                <li key={session.id}>
                  <div
                    className={`w-full rounded-lg px-2.5 py-2 text-left transition disabled:opacity-50 ${
                      active
                        ? 'bg-indigo-500/10 text-slate-200'
                        : 'bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => onSelectSession(session.id)}
                        className="min-w-0 flex-1 text-left disabled:opacity-50"
                      >
                        <p className="line-clamp-2 text-[11px] leading-snug">{session.userInput}</p>
                        <p className="mt-1 truncate text-[10px] text-slate-600">
                          {taskTypeLabel(session.taskType)} · {session.runCount ?? 1} 轮 · {session.status}
                        </p>
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => onDeleteSession(session)}
                        className="shrink-0 rounded-md px-1.5 py-1 text-[10px] text-slate-600 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                        title="删除历史任务"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-1 text-[11px] text-slate-600">运行任务后将显示历史记录</p>
        )}
      </div>
    </aside>
  );
}
