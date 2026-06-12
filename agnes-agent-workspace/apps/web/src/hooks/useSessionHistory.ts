import { useCallback, useEffect, useState } from 'react';
import type { AgentRunResult, SessionListItem } from '../types/agent';

export function useSessionHistory() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const refreshSessions = useCallback(async () => {
    setLoadingSessions(true);
    setHistoryError(null);
    try {
      const response = await fetch('/api/agent/sessions?limit=30');
      const data = (await response.json()) as { sessions?: SessionListItem[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? '会话历史读取失败');
      setSessions(data.sessions ?? []);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : '会话历史读取失败');
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const loadSession = useCallback(async (sessionId: string): Promise<AgentRunResult[] | null> => {
    setHistoryError(null);
    try {
      const response = await fetch(`/api/agent/sessions/${sessionId}`);
      const data = (await response.json()) as
        | (AgentRunResult & { error?: string })
        | { sessionId: string; runs?: AgentRunResult[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? '会话读取失败');
      const maybeRuns = (data as { runs?: AgentRunResult[] }).runs;
      if (Array.isArray(maybeRuns)) return maybeRuns;
      return [data as AgentRunResult];
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : '会话读取失败');
      return null;
    }
  }, []);

  const deleteSession = useCallback(async (sessionId: string): Promise<boolean> => {
    setHistoryError(null);
    try {
      const response = await fetch(`/api/agent/sessions/${sessionId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({} as { error?: string }));
        throw new Error(data.error ?? '会话删除失败');
      }
      setSessions((prev) => prev.filter((session) => session.id !== sessionId));
      return true;
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : '会话删除失败');
      return false;
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  return {
    sessions,
    loadingSessions,
    historyError,
    refreshSessions,
    loadSession,
    deleteSession,
  };
}
