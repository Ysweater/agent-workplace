import { useState } from 'react';
import type { ToolCallRecord } from '../types/agent';
import { formatDurationMs } from '../utils/format';
import { summarizeToolOutput } from '../utils/toolSummary';

interface ExecutionDetailsProps {
  toolCalls: ToolCallRecord[];
  defaultOpen?: boolean;
  compact?: boolean;
}

export default function ExecutionDetails({
  toolCalls,
  defaultOpen = false,
  compact = false,
}: ExecutionDetailsProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (toolCalls.length === 0) return null;

  return (
    <div className={`rounded-xl border border-[var(--agnes-border-subtle)] bg-[var(--agnes-card)] ${compact ? '' : 'mt-4'}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-white/[0.02]"
      >
        <div>
          <p className="text-xs font-medium text-slate-300">执行详情</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {toolCalls.length} 次工具调用 · 点击{open ? '收起' : '展开'} JSON
          </p>
        </div>
        <span className="text-slate-500">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <ul className="space-y-2 border-t border-[var(--agnes-border-subtle)] px-3 py-3">
          {toolCalls.map((call) => (
            <li
              key={call.id}
              className="rounded-lg border border-[var(--agnes-border-subtle)] bg-black/20 px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-indigo-300">{call.toolName}</span>
                <span
                  className={`text-[10px] font-medium ${
                    call.success ? 'text-emerald-400' : call.error ? 'text-red-400' : 'text-amber-300'
                  }`}
                >
                  {call.success ? '完成' : call.error ? '失败' : '执行中'}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{summarizeToolOutput(call)}</p>
              <p className="mt-0.5 text-[10px] text-slate-600">
                耗时 {formatDurationMs(call.startedAt, call.completedAt)}
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-[10px] text-slate-500 hover:text-slate-400">
                  查看 input / output
                </summary>
                <div className="mt-2 space-y-2">
                  <pre className="max-h-32 overflow-auto rounded bg-black/30 p-2 text-[10px] leading-relaxed text-slate-500">
                    {JSON.stringify(call.input, null, 2)}
                  </pre>
                  <pre className="max-h-40 overflow-auto rounded bg-black/30 p-2 text-[10px] leading-relaxed text-slate-500">
                    {call.error ?? JSON.stringify(call.output, null, 2)}
                  </pre>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      {!open && (
        <ul className="space-y-1.5 border-t border-[var(--agnes-border-subtle)] px-4 py-3">
          {toolCalls.map((call) => (
            <li key={call.id} className="flex items-start justify-between gap-3 text-[11px]">
              <div className="min-w-0">
                <span className="font-mono text-indigo-300/90">{call.toolName}</span>
                <p className="mt-0.5 truncate text-slate-500">{summarizeToolOutput(call)}</p>
              </div>
              <span className="shrink-0 text-slate-600">
                {formatDurationMs(call.startedAt, call.completedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
