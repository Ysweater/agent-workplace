import { storageService } from './storage.service.js';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  runId?: string;
  timestamp: string;
}

export async function loadConversation(sessionId: string): Promise<ConversationTurn[]> {
  return storageService.loadConversation(sessionId);
}

export async function appendConversationTurns(
  sessionId: string,
  turns: ConversationTurn[],
): Promise<ConversationTurn[]> {
  const existing = await loadConversation(sessionId);
  const merged = [...existing, ...turns].slice(-40);
  await storageService.saveConversation(sessionId, merged);
  return merged;
}

export async function deleteConversation(sessionId: string): Promise<void> {
  await storageService.deleteConversation(sessionId);
}

export function formatConversationForPrompt(turns: ConversationTurn[], maxTurns = 6): string {
  const recent = turns.slice(-maxTurns);
  if (recent.length === 0) return '';
  return recent.map((t) => `${t.role === 'user' ? '用户' : '助手'}: ${t.content}`).join('\n');
}
