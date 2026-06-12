import { useMemo, useState } from 'react';
import type { AgentPlan, AgentRunResult, Artifact, ToolCallRecord } from '../types/agent';
import { extractSummary } from '../utils/format';
import { RUN_STATUS_ZH, taskTypeLabel } from '../utils/status';
import type { LocalPreviewOffer } from '../utils/preview';
import ModelSettings from './ModelSettings';
import PreviewActions from './PreviewActions';
import StatusBadge from './StatusBadge';

const EXAMPLE_TASKS = [
  '调研 2026 年国内 AI Agent 产品发展趋势',
  '随机生成一个有首屏和表单的品牌官网',
  '生成一份 AI Agent 项目汇报 PPT',
  '画一张未来感机器人海报',
  '你能实现什么功能',
];

interface AgentMainViewProps {
  loading: boolean;
  lastInput: string | null;
  result: AgentRunResult | null;
  conversationRuns: AgentRunResult[];
  plan: AgentPlan | null;
  error: string | null;
  localPreview?: LocalPreviewOffer | null;
  sessionId?: string | null;
  onOpenLocalPreview?: () => void;
  onSubmit: (input: string) => void;
  onResume?: () => void;
}

function runArtifacts(run: AgentRunResult): Artifact[] {
  return run.artifacts ?? run.context?.artifacts ?? [];
}

function runToolCalls(run: AgentRunResult): ToolCallRecord[] {
  return run.toolCalls ?? run.context?.toolCalls ?? [];
}

function runPlan(run: AgentRunResult): AgentPlan | null {
  return run.plan ?? run.context?.plan ?? null;
}

function runTaskType(run: AgentRunResult): string | undefined {
  const finalResult = (run.finalResult ?? run.context?.finalResult) as { mode?: string } | undefined;
  if (finalResult?.mode === 'chat') return 'chat';
  return runPlan(run)?.taskType ?? run.task?.taskType ?? run.context?.task?.taskType;
}

function runInput(run: AgentRunResult): string {
  return run.task?.userInput ?? run.context?.task?.userInput ?? 'Agent 任务';
}

function RunCard({
  run,
  isLatest,
  loading,
  error,
  localPreview,
  onOpenLocalPreview,
  onResume,
}: {
  run: AgentRunResult;
  isLatest: boolean;
  loading: boolean;
  error: string | null;
  localPreview?: LocalPreviewOffer | null;
  onOpenLocalPreview?: () => void;
  onResume?: () => void;
}) {
  const plan = runPlan(run);
  const steps = plan?.steps ?? [];
  const artifacts = runArtifacts(run);
  const toolCalls = runToolCalls(run);
  const finalResult = run.finalResult ?? run.context?.finalResult;
  const summary = !loading || !isLatest ? extractSummary({ finalResult, artifacts }) : null;
  const immediateReply =
    run.immediateReply ??
    ((finalResult as { mode?: string; summary?: string } | undefined)?.mode === 'workflow_started'
      ? (finalResult as { summary?: string }).summary
      : undefined);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600/90 px-4 py-3 text-sm leading-relaxed text-white shadow-lg shadow-indigo-950/30">
          {runInput(run)}
        </div>
      </div>

      {immediateReply && (
        <div className="flex justify-start">
          <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-indigo-500/25 bg-indigo-500/10 px-4 py-3 text-sm leading-relaxed text-indigo-100">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-indigo-300/80">
              Agnes 即时回复
            </p>
            {immediateReply}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[var(--agnes-border-subtle)] bg-[var(--agnes-card)] p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-500">Agent 运行</p>
            <p className="mt-1 text-sm font-medium text-slate-100">
              {taskTypeLabel(runTaskType(run))}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            {isLatest && loading ? (
              <span className="flex items-center gap-1.5 text-amber-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                执行中
              </span>
            ) : (
              <span className={run.status === 'completed' ? 'text-emerald-400' : 'text-red-400'}>
                {RUN_STATUS_ZH[run.status] ?? run.status}
              </span>
            )}
            {run.durationMs !== undefined && <span>{run.durationMs}ms</span>}
            {toolCalls.length > 0 && <span>{toolCalls.length} 次工具调用</span>}
            {run.status === 'failed' && isLatest && onResume && !loading && (
              <button
                type="button"
                onClick={onResume}
                className="rounded-lg border border-amber-500/40 px-2 py-1 text-[10px] text-amber-200 transition hover:bg-amber-500/10"
              >
                断点续传
              </button>
            )}
          </div>
        </div>

        {isLatest && error && (
          <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {isLatest && loading && steps.length === 0 && (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
            正在生成计划并执行...
          </div>
        )}

        {steps.length > 0 && (
          <ol className="mt-4 space-y-2">
            {steps.map((step, index) => {
              const displayStatus =
                isLatest && loading && step.status === 'pending' && index === 0
                  ? 'running'
                  : step.status;
              return (
                <li
                  key={step.id}
                  className="flex items-start gap-3 rounded-lg bg-black/20 px-3 py-2.5"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] text-slate-500">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm text-slate-200">{step.title}</p>
                      <StatusBadge status={displayStatus} pulse={displayStatus === 'running'} />
                    </div>
                    <p className="mt-0.5 font-mono text-[11px] text-indigo-300/80">
                      {step.toolName}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
                      {step.reason}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {isLatest && localPreview && !loading && (
          <div className="mt-4 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-3 py-3">
            <p className="text-xs font-medium text-indigo-200">
              {localPreview.blocked ? '本地预览已就绪，弹窗被拦截' : '本地预览已打开'}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              {localPreview.devUrl
                ? `本地 Vite 站点：${localPreview.devUrl}`
                : localPreview.html
                  ? `${localPreview.title} 可在右侧产物区查看，也可以打开独立窗口。`
                  : 'Vite 站点正在后台启动，完成后可打开预览。'}
            </p>
            <div className="mt-3">
              <PreviewActions
                html={localPreview.html}
                title={localPreview.title}
                devUrl={localPreview.devUrl}
                compact
              />
            </div>
            {localPreview.blocked && onOpenLocalPreview && (
              <button
                type="button"
                onClick={onOpenLocalPreview}
                className="mt-2 text-[11px] text-indigo-300 underline-offset-2 hover:underline"
              >
                手动打开新窗口
              </button>
            )}
          </div>
        )}

        {summary && (
          <div className="mt-4 rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-3 py-3">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-emerald-400/80">
              执行摘要
            </p>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
              {summary.length > 700 ? `${summary.slice(0, 700)}...` : summary}
            </p>
          </div>
        )}

        {toolCalls.length > 0 && (
          <p className="mt-4 text-[11px] text-slate-600">
            工具调用 JSON、事件流与产物预览见右侧「产物工作区」。
          </p>
        )}
      </div>
    </div>
  );
}

export default function AgentMainView({
  loading,
  result,
  conversationRuns,
  error,
  localPreview,
  sessionId,
  onOpenLocalPreview,
  onSubmit,
  onResume,
}: AgentMainViewProps) {
  const [input, setInput] = useState('');
  const [pendingExample, setPendingExample] = useState<string | null>(null);
  const visibleRuns = useMemo(() => {
    if (conversationRuns.length > 0) return conversationRuns;
    return result ? [result] : [];
  }, [conversationRuns, result]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = (pendingExample ?? input).trim();
    if (!text || loading) return;
    onSubmit(text);
    setInput('');
    setPendingExample(null);
  };

  const fillExample = (task: string) => {
    setPendingExample(task);
    setInput(task);
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[var(--agnes-bg)]">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visibleRuns.length === 0 && !loading ? (
          <div className="flex min-h-full flex-col items-center justify-center px-4 py-10 sm:px-6">
            <div className="w-full max-w-xl text-center">
              <h2 className="text-xl font-medium text-slate-100">描述你的 Agent 任务</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Agnes 会先快速回复，再按工作流规划、调用工具并交付可预览产物。
              </p>
              <div className="mx-auto mt-8 grid max-w-lg gap-2.5">
                {EXAMPLE_TASKS.map((task) => (
                  <button
                    key={task}
                    type="button"
                    disabled={loading}
                    onClick={() => fillExample(task)}
                    className="rounded-xl border border-[var(--agnes-border-subtle)] bg-white/[0.03] px-4 py-3 text-center text-xs leading-relaxed text-slate-400 transition hover:border-indigo-500/30 hover:bg-white/[0.05] hover:text-slate-200 disabled:opacity-50"
                  >
                    {task}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6">
            {visibleRuns.map((run, index) => (
              <RunCard
                key={run.runId}
                run={run}
                isLatest={index === visibleRuns.length - 1}
                loading={loading}
                error={error}
                localPreview={localPreview}
                onOpenLocalPreview={onOpenLocalPreview}
                onResume={onResume}
              />
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--agnes-border-subtle)] bg-[var(--agnes-panel)] px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <form onSubmit={handleSubmit} className="relative">
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setPendingExample(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="继续对话或描述新任务，例如：基于刚才的内容再生成一份 PPT..."
              rows={2}
              disabled={loading}
              className="min-h-[104px] w-full resize-none rounded-2xl border border-[var(--agnes-border-subtle)] bg-[var(--agnes-card)] px-4 pb-12 pt-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none transition focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 disabled:opacity-60"
            />
            <div className="absolute bottom-2.5 left-2.5">
              <ModelSettings placement="input" locked={loading} sessionId={sessionId} />
            </div>
            <button
              type="submit"
              disabled={loading || !(input.trim() || pendingExample)}
              className="absolute bottom-2.5 right-2.5 rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? '执行中' : '发送'}
            </button>
          </form>
          <p className="mt-2 text-center text-[10px] text-slate-600">
            Enter 发送 · Shift+Enter 换行 · 当前会话会保留上下文
          </p>
        </div>
      </div>
    </section>
  );
}
