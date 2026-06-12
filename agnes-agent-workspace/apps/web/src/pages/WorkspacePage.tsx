import { useEffect, useRef, useState } from 'react';
import AgentMainView from '../components/AgentMainView';
import ArtifactWorkspace from '../components/ArtifactWorkspace';
import Sidebar from '../components/Sidebar';
import WorkspaceHeader from '../components/WorkspaceHeader';
import { useAgentRun } from '../hooks/useAgentRun';
import { useSessionHistory } from '../hooks/useSessionHistory';
import type { SessionListItem } from '../types/agent';
import { resolvePreviewFromRun } from '../utils/artifactPreview';
import { openHtmlInNewWindow, type LocalPreviewOffer } from '../utils/preview';

function findWebsiteBuilderOutput(
  toolCalls: Array<{ toolName: string; output?: unknown }>,
): unknown {
  const call = [...toolCalls].reverse().find((c) => c.toolName === 'website_builder');
  return call?.output;
}

export default function WorkspacePage() {
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [workspaceWidth, setWorkspaceWidth] = useState(520);
  const [localPreview, setLocalPreview] = useState<LocalPreviewOffer | null>(null);
  const autoOpenedRunId = useRef<string | null>(null);
  const {
    loading,
    result,
    conversationRuns,
    lastInput,
    error,
    artifacts,
    toolCalls,
    plan,
    run,
    resume,
    loadResults,
    reset,
  } = useAgentRun();
  const {
    sessions,
    loadingSessions,
    historyError,
    refreshSessions,
    loadSession,
    deleteSession,
  } = useSessionHistory();

  const websiteOutput = findWebsiteBuilderOutput(toolCalls);

  useEffect(() => {
    const site = websiteOutput as { launchStatus?: string; devUrl?: string; title?: string } | undefined;
    if (!site || site.launchStatus !== 'starting' || site.devUrl) return;

    let active = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/sites/status');
        if (!res.ok) return;
        const data = (await res.json()) as { activeDev?: { devUrl: string } };
        if (!active || !data.activeDev?.devUrl) return;
        setLocalPreview((prev) =>
          prev
            ? { ...prev, devUrl: data.activeDev!.devUrl, blocked: false }
            : {
                title: site.title ?? '本地站点',
                html: '',
                blocked: false,
                devUrl: data.activeDev!.devUrl,
              },
        );
      } catch {
        // ignore poll errors
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), 4000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [websiteOutput]);

  useEffect(() => {
    if (!result || loading || result.status !== 'completed' || !result.runId) return;
    if (autoOpenedRunId.current === result.runId) return;

    const preview = resolvePreviewFromRun(artifacts, websiteOutput);
    if (!preview.html && preview.kind !== 'website') return;

    autoOpenedRunId.current = result.runId;
    setWorkspaceOpen(true);

    const site = websiteOutput as { devUrl?: string; title?: string } | undefined;
    if (site?.devUrl) {
      window.open(site.devUrl, '_blank', 'noopener,noreferrer');
      setLocalPreview({
        title: site.title ?? preview.title,
        html: preview.html ?? '',
        blocked: false,
        devUrl: site.devUrl,
      });
      return;
    }

    if (!preview.html) return;

    const opened = openHtmlInNewWindow(preview.html, preview.title);
    setLocalPreview({
      title: preview.title,
      html: preview.html,
      blocked: !opened,
    });
  }, [result, loading, artifacts, websiteOutput]);

  const handleSubmit = async (input: string) => {
    const data = await run(input);
    if (data) void refreshSessions();
  };

  const handleSelectSession = async (sessionId: string) => {
    if (loading) return;
    const runs = await loadSession(sessionId);
    if (runs?.length) {
      const latest = runs.at(-1) ?? null;
      autoOpenedRunId.current = latest?.runId ?? null;
      setLocalPreview(null);
      setWorkspaceOpen(true);
      loadResults(runs);
    }
  };

  const handleNewTask = () => {
    autoOpenedRunId.current = null;
    setLocalPreview(null);
    reset();
  };

  const handleDeleteSession = async (session: SessionListItem) => {
    if (loading) return;
    const confirmed = window.confirm(`删除这条历史任务？\n\n${session.userInput}`);
    if (!confirmed) return;
    const deleted = await deleteSession(session.id);
    if (deleted && result?.runId === session.id) {
      handleNewTask();
    }
  };

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const onMove = (event: PointerEvent) => {
      const next = Math.min(Math.max(window.innerWidth - event.clientX, 360), 780);
      setWorkspaceWidth(next);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden">
      <WorkspaceHeader />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <Sidebar
          loading={loading}
          lastRunLabel={lastInput}
          sessions={sessions}
          loadingSessions={loadingSessions}
          historyError={historyError}
          onNewTask={handleNewTask}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
        />

        <AgentMainView
          loading={loading}
          lastInput={lastInput}
          result={result}
          conversationRuns={conversationRuns}
          plan={plan}
          error={error}
          localPreview={localPreview}
          onOpenLocalPreview={() => {
            if (!localPreview) return;
            const opened = openHtmlInNewWindow(localPreview.html, localPreview.title);
            if (opened) {
              setLocalPreview((prev) => (prev ? { ...prev, blocked: false } : prev));
            }
          }}
          onSubmit={(input) => void handleSubmit(input)}
          onResume={
            result?.status === 'failed' && result.runId
              ? () => void resume(result.runId)
              : undefined
          }
        />

        {workspaceOpen ? (
          <>
            <div
              role="separator"
              aria-label="调整产物工作区宽度"
              onPointerDown={startResize}
              className="hidden w-1.5 shrink-0 cursor-col-resize bg-transparent transition hover:bg-indigo-500/30 lg:block"
            />
            <ArtifactWorkspace
              artifacts={artifacts}
              websiteOutput={websiteOutput}
              plan={plan}
              toolCalls={toolCalls}
              trace={result?.trace}
              runId={result?.runId}
              status={result?.status}
              error={error}
              width={workspaceWidth}
              onCollapse={() => setWorkspaceOpen(false)}
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setWorkspaceOpen(true)}
            className="hidden w-10 shrink-0 border-l border-[var(--agnes-border-subtle)] bg-[var(--agnes-panel)] text-[11px] text-slate-500 transition hover:text-slate-200 lg:block"
            title="显示产物工作区"
          >
            <span className="[writing-mode:vertical-rl]">产物工作区</span>
          </button>
        )}
      </div>
    </div>
  );
}
