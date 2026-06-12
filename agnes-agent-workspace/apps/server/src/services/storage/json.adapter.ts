import type { ToolCallRecord } from '@agnes/agent-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  ConversationTurnRecord,
  ReportListItem,
  SavedReport,
  SessionListItem,
  StorageAdapter,
  StorageStatus,
} from './types.js';
import { extractSessionMeta, extractToolCallsFromSession } from './utils.js';

export class JsonFileStorage implements StorageAdapter {
  private root: string;
  private sessionsDir: string;
  private conversationsDir: string;
  private reportsDir: string;
  private toolCallsDir: string;

  constructor(root: string) {
    this.root = root;
    this.sessionsDir = path.join(root, 'sessions');
    this.conversationsDir = path.join(root, 'conversations');
    this.reportsDir = path.join(root, 'reports');
    this.toolCallsDir = path.join(root, 'tool_calls');
  }

  getStatus(): StorageStatus {
    return {
      driver: 'json',
      fallback: false,
      detail: `JSON files at ${this.root}`,
    };
  }

  private async ensureDirs(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
    await fs.mkdir(this.conversationsDir, { recursive: true });
    await fs.mkdir(this.reportsDir, { recursive: true });
    await fs.mkdir(this.toolCallsDir, { recursive: true });
  }

  async saveSession(sessionId: string, data: unknown): Promise<void> {
    await this.ensureDirs();
    await fs.writeFile(
      path.join(this.sessionsDir, `${sessionId}.json`),
      JSON.stringify(data, null, 2),
      'utf-8',
    );

    const toolCalls = extractToolCallsFromSession(data);
    await fs.writeFile(
      path.join(this.toolCallsDir, `${sessionId}.json`),
      JSON.stringify(toolCalls, null, 2),
      'utf-8',
    );
  }

  async loadSession(sessionId: string): Promise<unknown | null> {
    try {
      const raw = await fs.readFile(
        path.join(this.sessionsDir, `${sessionId}.json`),
        'utf-8',
      );
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  async listSessions(limit = 30): Promise<SessionListItem[]> {
    await this.ensureDirs();
    const files = await fs.readdir(this.sessionsDir);
    const groups = new Map<string, SessionListItem>();

    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const fileId = file.replace(/\.json$/, '');
      try {
        const fullPath = path.join(this.sessionsDir, file);
        const raw = await fs.readFile(fullPath, 'utf-8');
        const data = JSON.parse(raw) as unknown;
        const meta = extractSessionMeta(data);
        const stats = await fs.stat(fullPath);
        const sessionId = meta.sessionId ?? meta.runId ?? fileId;
        const createdAt = meta.createdAt ?? extractCreatedAt(data) ?? stats.birthtime.toISOString();
        const updatedAt = meta.updatedAt ?? stats.mtime.toISOString();
        const existing = groups.get(sessionId);
        if (!existing) {
          groups.set(sessionId, {
            id: sessionId,
            userInput: meta.userInput ?? '未命名任务',
            status: meta.status ?? 'unknown',
            taskType: meta.taskType,
            createdAt,
            updatedAt,
            runCount: 1,
          });
          continue;
        }

        const isEarlier = new Date(createdAt).getTime() < new Date(existing.createdAt).getTime();
        const isLater = new Date(updatedAt).getTime() > new Date(existing.updatedAt ?? existing.createdAt).getTime();
        groups.set(sessionId, {
          ...existing,
          userInput: isEarlier ? meta.userInput ?? existing.userInput : existing.userInput,
          status: isLater ? meta.status ?? existing.status : existing.status,
          taskType: isLater ? meta.taskType ?? existing.taskType : existing.taskType,
          createdAt: isEarlier ? createdAt : existing.createdAt,
          updatedAt: isLater ? updatedAt : existing.updatedAt,
          runCount: (existing.runCount ?? 1) + 1,
        });
      } catch {
        const sessionId = fileId;
        if (!groups.has(sessionId)) {
          groups.set(sessionId, {
            id: sessionId,
            userInput: '未命名任务',
            status: 'unknown',
            createdAt: new Date(0).toISOString(),
            runCount: 1,
          });
        }
      }
    }

    return [...groups.values()]
      .sort(
        (a, b) =>
          new Date(b.updatedAt ?? b.createdAt).getTime() -
          new Date(a.updatedAt ?? a.createdAt).getTime(),
      )
      .slice(0, Math.max(1, limit));
  }

  async listSessionRuns(sessionId: string): Promise<unknown[]> {
    await this.ensureDirs();
    const files = await fs.readdir(this.sessionsDir);
    const runs: unknown[] = [];

    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const fileId = file.replace(/\.json$/, '');
      try {
        const raw = await fs.readFile(path.join(this.sessionsDir, file), 'utf-8');
        const data = JSON.parse(raw) as unknown;
        const meta = extractSessionMeta(data);
        const runSessionId = meta.sessionId ?? meta.runId ?? fileId;
        if (runSessionId === sessionId || fileId === sessionId) {
          runs.push(data);
        }
      } catch {
        // Ignore unreadable historical records.
      }
    }

    return runs.sort((a, b) => {
      const aMeta = extractSessionMeta(a);
      const bMeta = extractSessionMeta(b);
      return new Date(aMeta.createdAt ?? 0).getTime() - new Date(bMeta.createdAt ?? 0).getTime();
    });
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    await this.ensureDirs();
    const runs = await this.listSessionRuns(sessionId);
    const runIds = new Set<string>([sessionId]);
    for (const run of runs) {
      const meta = extractSessionMeta(run);
      if (meta.runId) runIds.add(meta.runId);
    }

    const targets = [...runIds].flatMap((id) => [
      path.join(this.sessionsDir, `${id}.json`),
      path.join(this.toolCallsDir, `${id}.json`),
    ]);
    let deleted = false;

    for (const target of targets) {
      try {
        await fs.unlink(target);
        deleted = true;
      } catch {
        // Missing files are treated as already gone.
      }
    }

    return deleted;
  }

  async loadConversation(sessionId: string): Promise<ConversationTurnRecord[]> {
    try {
      const raw = await fs.readFile(
        path.join(this.conversationsDir, `${sessionId}.json`),
        'utf-8',
      );
      const data = JSON.parse(raw) as { turns?: ConversationTurnRecord[] };
      return Array.isArray(data.turns) ? data.turns : [];
    } catch {
      return [];
    }
  }

  async saveConversation(sessionId: string, turns: ConversationTurnRecord[]): Promise<void> {
    await this.ensureDirs();
    await fs.writeFile(
      path.join(this.conversationsDir, `${sessionId}.json`),
      JSON.stringify({ sessionId, turns, updatedAt: new Date().toISOString() }, null, 2),
      'utf-8',
    );
  }

  async deleteConversation(sessionId: string): Promise<void> {
    try {
      await fs.unlink(path.join(this.conversationsDir, `${sessionId}.json`));
    } catch {
      // Missing conversation memory is fine.
    }
  }

  async listToolCalls(sessionId: string): Promise<ToolCallRecord[]> {
    try {
      const raw = await fs.readFile(
        path.join(this.toolCallsDir, `${sessionId}.json`),
        'utf-8',
      );
      return JSON.parse(raw) as ToolCallRecord[];
    } catch {
      const session = await this.loadSession(sessionId);
      return extractToolCallsFromSession(session);
    }
  }

  async saveReport(report: SavedReport): Promise<SavedReport> {
    await this.ensureDirs();
    await fs.writeFile(
      path.join(this.reportsDir, `${report.id}.json`),
      JSON.stringify(report, null, 2),
      'utf-8',
    );
    return report;
  }

  async loadReport(reportId: string): Promise<SavedReport | null> {
    try {
      const raw = await fs.readFile(
        path.join(this.reportsDir, `${reportId}.json`),
        'utf-8',
      );
      return JSON.parse(raw) as SavedReport;
    } catch {
      return null;
    }
  }

  async listReports(): Promise<ReportListItem[]> {
    await this.ensureDirs();
    const files = await fs.readdir(this.reportsDir);
    const items: ReportListItem[] = [];

    for (const file of files.filter((f) => f.endsWith('.json'))) {
      try {
        const raw = await fs.readFile(path.join(this.reportsDir, file), 'utf-8');
        const data = JSON.parse(raw) as Partial<SavedReport>;
        items.push({
          id: data.id ?? file.replace(/\.json$/, ''),
          title: data.title ?? 'Untitled Report',
          createdAt: data.createdAt ?? new Date(0).toISOString(),
        });
      } catch {
        items.push({
          id: file.replace(/\.json$/, ''),
          title: 'Untitled Report',
          createdAt: new Date(0).toISOString(),
        });
      }
    }

    return items.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async close(): Promise<void> {
    // no-op for file storage
  }
}

function extractCreatedAt(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const record = data as Record<string, unknown>;
  if (typeof record.createdAt === 'string') return record.createdAt;
  if (record.context && typeof record.context === 'object') {
    const ctx = record.context as Record<string, unknown>;
    const task = ctx.task && typeof ctx.task === 'object' ? ctx.task as Record<string, unknown> : null;
    if (typeof task?.createdAt === 'string') return task.createdAt;
  }
  return undefined;
}
