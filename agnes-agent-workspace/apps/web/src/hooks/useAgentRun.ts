import { useCallback, useState } from 'react';
import type { AgentRunResult } from '../types/agent';

const POLL_INTERVAL_MS = 900;
const MAX_POLLS = 120;

async function readJsonResponse(response: Response): Promise<AgentRunResult & { error?: string }> {
  const raw = await response.text();
  if (!raw.trim()) {
    throw new Error(
      response.ok
        ? '服务器返回了空响应'
        : `请求失败 (${response.status})：请确认后端 :3001 服务正常`,
    );
  }

  try {
    return JSON.parse(raw) as AgentRunResult & { error?: string };
  } catch {
    throw new Error(`响应不是合法 JSON：${raw.slice(0, 120)}`);
  }
}

async function runSyncFallback(userInput: string, sessionId?: string | null): Promise<AgentRunResult> {
  const response = await fetch('/api/agent/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userInput, sessionId: sessionId ?? undefined }),
  });
  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed: ${response.status}`);
  }
  return data;
}

function upsertRun(list: AgentRunResult[], next: AgentRunResult): AgentRunResult[] {
  const index = list.findIndex((item) => item.runId === next.runId);
  if (index < 0) return [...list, next];
  return list.map((item, i) => (i === index ? next : item));
}

export function useAgentRun() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [conversationRuns, setConversationRuns] = useState<AgentRunResult[]>([]);
  const [lastInput, setLastInput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const run = useCallback(async (userInput: string) => {
    setLoading(true);
    setError(null);
    setLastInput(userInput);
    const activeSessionId = sessionId;

    try {
      const response = await fetch('/api/agent/run-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput, sessionId: activeSessionId ?? undefined }),
      });
      const started = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(started.error ?? `Request failed: ${response.status}`);
      }

      setResult(started);
      setConversationRuns((prev) => upsertRun(prev, started));
      if (started.sessionId) setSessionId(started.sessionId);
      if (started.status !== 'queued' && started.status !== 'running') {
        return started;
      }

      for (let i = 0; i < MAX_POLLS; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
        const pollResponse = await fetch(`/api/agent/runs/${started.runId}`);
        const polled = await readJsonResponse(pollResponse);
        if (!pollResponse.ok) {
          throw new Error(polled.error ?? `Poll failed: ${pollResponse.status}`);
        }
        setResult(polled);
        setConversationRuns((prev) => upsertRun(prev, polled));
        if (polled.sessionId) setSessionId(polled.sessionId);
        if (polled.status === 'completed' || polled.status === 'failed') {
          return polled;
        }
      }

      return started;
    } catch {
      try {
        const data = await runSyncFallback(userInput, activeSessionId);
        setResult(data);
        setConversationRuns((prev) => upsertRun(prev, data));
        if (data.sessionId) setSessionId(data.sessionId);
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        return null;
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const resume = useCallback(async (runId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/agent/runs/${runId}/resume`, { method: 'POST' });
      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.error ?? `Resume failed: ${response.status}`);
      }
      setResult(data);
      setConversationRuns((prev) => upsertRun(prev, data));
      if (data.sessionId) setSessionId(data.sessionId);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Resume failed';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setConversationRuns([]);
    setLastInput(null);
    setError(null);
    setSessionId(null);
  }, []);

  const loadResult = useCallback((nextResult: AgentRunResult) => {
    setResult(nextResult);
    setConversationRuns([nextResult]);
    setSessionId(nextResult.sessionId ?? nextResult.runId ?? null);
    setLastInput(
      nextResult.task?.userInput ??
        nextResult.context?.task?.userInput ??
        '历史任务',
    );
    setError(nextResult.error ?? null);
  }, []);

  const loadResults = useCallback((runs: AgentRunResult[]) => {
    const latest = runs.at(-1) ?? null;
    setResult(latest);
    setConversationRuns(runs);
    setSessionId(latest?.sessionId ?? latest?.runId ?? null);
    setLastInput(
      latest?.task?.userInput ??
        latest?.context?.task?.userInput ??
        (runs.length > 0 ? '历史会话' : null),
    );
    setError(latest?.error ?? null);
  }, []);

  const artifacts = result?.artifacts ?? result?.context?.artifacts ?? [];
  const toolCalls = result?.toolCalls ?? result?.context?.toolCalls ?? [];
  const plan = result?.plan ?? result?.context?.plan ?? null;

  return {
    loading,
    result,
    conversationRuns,
    lastInput,
    error,
    artifacts,
    toolCalls,
    plan,
    sessionId,
    run,
    resume,
    loadResult,
    loadResults,
    reset,
  };
}
