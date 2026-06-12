import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { AgentPlan, Artifact, ToolCallRecord, TraceEvent } from '../types/agent';
import {
  getWebsitePreviewHtml,
  parseWebsiteOutput,
  resolvePreviewFromRun,
} from '../utils/artifactPreview';
import ExecutionDetails from './ExecutionDetails';
import PreviewActions from './PreviewActions';
import { downloadTextFile, slugifyFilename } from '../utils/preview';

type WorkspaceTab = 'preview' | 'report' | 'summary' | 'files' | 'tools';

interface ArtifactWorkspaceProps {
  artifacts: Artifact[];
  websiteOutput?: unknown;
  plan: AgentPlan | null;
  toolCalls: ToolCallRecord[];
  trace?: TraceEvent[];
  runId?: string;
  status?: string;
  error?: string | null;
  width: number;
  onCollapse: () => void;
}

function pickDefaultTab(
  hasWebsite: boolean,
  hasHtml: boolean,
  hasMarkdown: boolean,
  hasMedia: boolean,
): WorkspaceTab | null {
  if (hasMedia) return 'preview';
  if (hasWebsite || hasHtml) return 'preview';
  if (hasMarkdown) return 'report';
  return null;
}

function isSummaryArtifact(artifact: Artifact): boolean {
  return artifact.type === 'markdown' && /执行总结|Execution Summary/i.test(artifact.title + artifact.content);
}

function ArtifactTextActions({ artifact }: { artifact: Artifact }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const download = () => {
    const ext = artifact.type === 'html' ? 'html' : 'md';
    const mime = artifact.type === 'html' ? 'text/html;charset=utf-8' : 'text/markdown;charset=utf-8';
    downloadTextFile(artifact.content, `${slugifyFilename(artifact.title)}.${ext}`, mime);
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void copy()}
        className="rounded-lg border border-[var(--agnes-border-subtle)] px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-indigo-500/40 hover:text-white"
      >
        {copied ? '已复制' : '复制'}
      </button>
      <button
        type="button"
        onClick={download}
        className="rounded-lg border border-[var(--agnes-border-subtle)] px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-indigo-500/40 hover:text-white"
      >
        下载
      </button>
    </div>
  );
}

export default function ArtifactWorkspace({
  artifacts,
  websiteOutput,
  plan,
  toolCalls,
  trace,
  runId,
  status,
  error,
  width,
  onCollapse,
}: ArtifactWorkspaceProps) {
  const website = parseWebsiteOutput(websiteOutput);
  const websiteHtml = website ? getWebsitePreviewHtml(website) : null;

  const summaryArtifacts = artifacts.filter(isSummaryArtifact);
  const markdownArtifacts = artifacts.filter((a) => a.type === 'markdown' && !isSummaryArtifact(a));
  const htmlArtifacts = artifacts.filter((a) => a.type === 'html');
  const mediaArtifacts = artifacts.filter((a) => a.type === 'image' || a.type === 'video');
  const activeMarkdown = markdownArtifacts.at(-1);
  const activeHtml = htmlArtifacts.at(-1);
  const activeMedia = mediaArtifacts.at(-1);

  const hasWebsite = Boolean(website && (websiteHtml || website.files?.length));
  const hasHtml = Boolean(activeHtml);
  const hasMarkdown = Boolean(activeMarkdown);
  const hasMedia = Boolean(activeMedia);
  const hasSummary = summaryArtifacts.length > 0;
  const hasFiles = Boolean(website?.files?.length);

  const availableTabs = useMemo(() => {
    const tabs: { id: WorkspaceTab; label: string }[] = [];
    if (hasWebsite || hasHtml || hasMedia) tabs.push({ id: 'preview', label: '预览' });
    if (hasMarkdown) tabs.push({ id: 'report', label: '报告' });
    if (hasSummary) tabs.push({ id: 'summary', label: '总结' });
    if (hasFiles) tabs.push({ id: 'files', label: '文件' });
    if (plan || toolCalls.length || trace?.length) tabs.push({ id: 'tools', label: '工具' });
    return tabs;
  }, [hasWebsite, hasHtml, hasMedia, hasMarkdown, hasSummary, hasFiles, plan, toolCalls.length, trace?.length]);

  const preferredTab = pickDefaultTab(hasWebsite, hasHtml, hasMarkdown, hasMedia);
  const [activeTab, setActiveTab] = useState<WorkspaceTab | null>(null);

  useEffect(() => {
    if (availableTabs.length === 0) {
      setActiveTab(null);
      return;
    }
    const preferred = preferredTab && availableTabs.some((t) => t.id === preferredTab)
      ? preferredTab
      : availableTabs[0].id;
    setActiveTab(preferred);
  }, [runId, availableTabs, preferredTab]);

  const currentTab = activeTab ?? availableTabs[0]?.id ?? null;
  const resolvedPreview = resolvePreviewFromRun(artifacts, websiteOutput);
  const previewHtml = resolvedPreview.html;
  const previewTitle = resolvedPreview.title;

  return (
    <aside
      className="flex h-[38vh] min-h-[280px] w-full shrink-0 flex-col border-t border-[var(--agnes-border-subtle)] bg-[var(--agnes-panel)] lg:h-auto lg:min-h-0 lg:w-[var(--artifact-width)] lg:border-l lg:border-t-0"
      style={{ '--artifact-width': `${width}px` } as CSSProperties}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--agnes-border-subtle)] px-4 py-3.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-100">产物工作区</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {status === 'completed'
              ? '任务产物已就绪'
              : status
                ? `状态 ${status}`
                : '运行任务后在此查看交付物'}
          </p>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="hidden rounded-lg border border-[var(--agnes-border-subtle)] px-2 py-1 text-[11px] text-slate-500 transition hover:border-indigo-500/40 hover:text-slate-200 lg:block"
        >
          隐藏
        </button>
      </div>

      {availableTabs.length > 0 && (
        <div className="flex shrink-0 gap-0.5 border-b border-[var(--agnes-border-subtle)] px-3 py-2">
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                currentTab === tab.id
                  ? 'bg-white/[0.08] text-slate-100'
                  : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {error && (
          <div className="m-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {!currentTab && !error && (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <p className="text-sm text-slate-600">提交任务后，报告与预览将显示在此</p>
          </div>
        )}

        {currentTab === 'preview' && activeMedia && (
          <div className="flex h-full min-h-0 flex-col p-3">
            <div className="mb-2 shrink-0">
              <p className="truncate text-xs font-medium text-slate-400">{activeMedia.title}</p>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-[var(--agnes-border-subtle)] bg-black/30 p-3">
              {activeMedia.type === 'image' ? (
                <img
                  src={activeMedia.content}
                  alt={activeMedia.title}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <video src={activeMedia.content} controls className="max-h-full max-w-full" />
              )}
            </div>
          </div>
        )}

        {currentTab === 'preview' && !activeMedia && (previewHtml || website?.devUrl) && (
          <div className="flex h-full min-h-0 flex-col p-3">
            <div className="mb-2 shrink-0 space-y-2">
              <p className="truncate text-xs font-medium text-slate-400">{previewTitle}</p>
              {website?.devUrl && (
                <p className="text-[11px] text-indigo-300/90">
                  预览已对齐本地 Vite 站点（与 :5180 相同版本）
                </p>
              )}
              <PreviewActions
                html={previewHtml ?? ''}
                title={previewTitle}
                files={resolvedPreview.files}
                devUrl={website?.devUrl}
                projectDir={website?.projectDir}
                compact
              />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--agnes-border-subtle)] bg-white shadow-inner">
              {website?.devUrl ? (
                <iframe
                  title={previewTitle}
                  src={website.devUrl}
                  className="h-full min-h-[320px] w-full"
                  sandbox="allow-scripts allow-same-origin"
                />
              ) : (
                <iframe
                  title={previewTitle}
                  srcDoc={previewHtml ?? ''}
                  className="h-full min-h-[320px] w-full"
                  sandbox="allow-scripts"
                />
              )}
            </div>
            {website?.previewNotes && (
              <p className="mt-2 shrink-0 text-[11px] text-slate-500">{website.previewNotes}</p>
            )}
          </div>
        )}

        {currentTab === 'report' && activeMarkdown && (
          <div className="flex h-full min-h-0 flex-col p-4">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
              <h3 className="min-w-0 truncate text-sm font-medium text-slate-200">
                {activeMarkdown.title}
              </h3>
              <ArtifactTextActions artifact={activeMarkdown} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
            <article className="prose prose-invert prose-sm max-w-none">
              <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-300">
                {activeMarkdown.content}
              </pre>
            </article>
            </div>
          </div>
        )}

        {currentTab === 'summary' && summaryArtifacts.length > 0 && (
          <div className="flex h-full min-h-0 flex-col p-4">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
              <h3 className="min-w-0 truncate text-sm font-medium text-slate-200">
                {summaryArtifacts.at(-1)?.title ?? '执行总结'}
              </h3>
              {summaryArtifacts.at(-1) && <ArtifactTextActions artifact={summaryArtifacts.at(-1)!} />}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--agnes-border-subtle)] bg-black/20 p-3">
              <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-300">
                {summaryArtifacts.at(-1)?.content}
              </pre>
            </div>
          </div>
        )}

        {currentTab === 'files' && website?.files && (
          <div className="h-full overflow-y-auto p-3">
            {website.description && (
              <p className="mb-3 text-xs text-slate-500">{website.description}</p>
            )}
            <ul className="space-y-2">
              {website.files.map((file) => (
                <li
                  key={file.path}
                  className="overflow-hidden rounded-lg border border-[var(--agnes-border-subtle)] bg-black/20"
                >
                  <details>
                    <summary className="cursor-pointer px-3 py-2.5 text-xs hover:bg-white/[0.02]">
                      <span className="font-mono text-indigo-300">{file.path}</span>
                      <span className="ml-2 text-slate-600">{file.language}</span>
                    </summary>
                    <pre className="max-h-48 overflow-auto border-t border-[var(--agnes-border-subtle)] bg-black/30 p-3 text-[10px] leading-relaxed text-slate-500">
                      {file.content}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        )}

        {currentTab === 'tools' && (
          <div className="h-full overflow-y-auto p-3">
            {plan && plan.steps.length > 0 && (
              <div className="mb-4 rounded-lg border border-[var(--agnes-border-subtle)] bg-black/20 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-slate-400">执行进度</span>
                  <span className="text-slate-500">
                    {plan.steps.filter((s) => s.status === 'success').length}/{plan.steps.length} 完成
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-indigo-500/80 transition-all"
                    style={{
                      width: `${Math.round(
                        (plan.steps.filter((s) => s.status === 'success').length / plan.steps.length) *
                          100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <ExecutionDetails toolCalls={toolCalls} defaultOpen={toolCalls.length <= 3} compact />

            {trace && trace.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                  事件流
                </p>
                <ul className="space-y-1 text-[10px] text-slate-500">
                  {trace.slice(0, 20).map((ev) => (
                    <li key={ev.id} className="font-mono">
                      [{ev.type}] {new Date(ev.timestamp).toLocaleTimeString()}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
