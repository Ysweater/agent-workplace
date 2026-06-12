import type { ConversationTurn } from '@agnes/agent-core';
import { loadConversation } from '../services/conversationMemory.service.js';
import { storageService } from '../services/storage.service.js';

export interface AgentMemory {
  recentTurns: ConversationTurn[];
  historicalRuns: unknown[];
}

function extractTurnsFromRuns(runs: unknown[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  for (const run of runs) {
    if (!run || typeof run !== 'object') continue;
    const record = run as {
      runId?: string;
      task?: { userInput?: string };
      context?: { task?: { userInput?: string }; finalResult?: unknown };
      finalResult?: unknown;
      artifacts?: Array<{ content?: string }>;
      createdAt?: string;
      completedAt?: string;
    };
    const userInput = record.task?.userInput ?? record.context?.task?.userInput;
    if (userInput) {
      turns.push({
        role: 'user',
        content: userInput,
        runId: record.runId,
        timestamp: record.createdAt ?? new Date().toISOString(),
      });
    }
    const final = (record.finalResult ?? record.context?.finalResult) as
      | { summary?: string; answer?: string }
      | undefined;
    const content =
      final?.answer ??
      final?.summary ??
      record.artifacts?.find((artifact) => artifact.content)?.content;
    if (content) {
      turns.push({
        role: 'assistant',
        content: String(content).slice(0, 2000),
        runId: record.runId,
        timestamp: record.completedAt ?? record.createdAt ?? new Date().toISOString(),
      });
    }
  }
  return turns.slice(-40);
}

export async function loadAgentMemory(sessionId: string): Promise<AgentMemory> {
  const recentTurns = await loadConversation(sessionId);
  const historicalRuns = await storageService.listSessionRuns(sessionId);
  return {
    recentTurns: recentTurns.length > 0 ? recentTurns : extractTurnsFromRuns(historicalRuns),
    historicalRuns,
  };
}
