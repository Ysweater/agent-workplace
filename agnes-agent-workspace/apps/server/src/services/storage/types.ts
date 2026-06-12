import type { ToolCallRecord } from '@agnes/agent-core';

export interface ConversationTurnRecord {
  role: 'user' | 'assistant';
  content: string;
  runId?: string;
  timestamp: string;
}

export interface ReportListItem {
  id: string;
  title: string;
  createdAt: string;
}

export interface SessionListItem {
  id: string;
  userInput: string;
  status: string;
  taskType?: string;
  createdAt: string;
  updatedAt?: string;
  runCount?: number;
}

export interface SavedReport {
  id: string;
  title: string;
  markdown?: string;
  html?: string;
  runId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelPreferenceRecord {
  sessionId: string;
  provider?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  presetId?: string;
  label?: string;
  apiKey?: string;
  updatedAt: string;
}

export type StorageDriver = 'json' | 'postgres';

export interface StorageStatus {
  driver: StorageDriver;
  fallback: boolean;
  detail: string;
}

export interface StorageAdapter {
  getStatus(): StorageStatus;
  saveSession(sessionId: string, data: unknown): Promise<void>;
  loadSession(sessionId: string): Promise<unknown | null>;
  listSessions(limit?: number): Promise<SessionListItem[]>;
  listSessionRuns(sessionId: string): Promise<unknown[]>;
  deleteSession(sessionId: string): Promise<boolean>;
  loadConversation(sessionId: string): Promise<ConversationTurnRecord[]>;
  saveConversation(sessionId: string, turns: ConversationTurnRecord[]): Promise<void>;
  deleteConversation(sessionId: string): Promise<void>;
  loadModelPreference(sessionId: string): Promise<ModelPreferenceRecord | null>;
  saveModelPreference(sessionId: string, preference: ModelPreferenceRecord): Promise<void>;
  deleteModelPreference(sessionId: string): Promise<void>;
  listToolCalls(sessionId: string): Promise<ToolCallRecord[]>;
  saveReport(report: SavedReport): Promise<SavedReport>;
  loadReport(reportId: string): Promise<SavedReport | null>;
  listReports(): Promise<ReportListItem[]>;
  close(): Promise<void>;
}
