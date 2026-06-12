import type { ToolCallRecord } from '@agnes/agent-core';
import pg from 'pg';
import type {
  ConversationTurnRecord,
  ModelPreferenceRecord,
  ReportListItem,
  SavedReport,
  SessionListItem,
  StorageAdapter,
  StorageStatus,
} from './types.js';
import { STORAGE_SCHEMA_SQL } from './schema.js';
import { extractSessionMeta, extractToolCallsFromSession } from './utils.js';

const { Pool } = pg;

export class PostgresStorage implements StorageAdapter {
  private pool: pg.Pool;
  private ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(STORAGE_SCHEMA_SQL);
    } finally {
      client.release();
    }
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  getStatus(): StorageStatus {
    return {
      driver: 'postgres',
      fallback: false,
      detail: 'PostgreSQL via DATABASE_URL',
    };
  }

  async saveSession(sessionId: string, data: unknown): Promise<void> {
    await this.ensureReady();
    const meta = extractSessionMeta(data);
    const payload = JSON.parse(JSON.stringify(data)) as unknown;
    const toolCalls = extractToolCallsFromSession(data);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO sessions (id, user_input, status, task_type, payload, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET
           user_input = EXCLUDED.user_input,
           status = EXCLUDED.status,
           task_type = EXCLUDED.task_type,
           payload = EXCLUDED.payload,
           updated_at = NOW()`,
        [
          sessionId,
          meta.userInput ?? null,
          meta.status ?? 'unknown',
          meta.taskType ?? null,
          payload,
        ],
      );

      await client.query('DELETE FROM tool_calls WHERE session_id = $1', [sessionId]);

      for (const call of toolCalls) {
        await client.query(
          `INSERT INTO tool_calls (
            id, session_id, step_id, tool_name, input, output, success, error, started_at, completed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            call.id,
            sessionId,
            call.stepId,
            call.toolName,
            call.input,
            call.output ?? null,
            call.success,
            call.error ?? null,
            call.startedAt,
            call.completedAt ?? null,
          ],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async loadSession(sessionId: string): Promise<unknown | null> {
    await this.ensureReady();
    const result = await this.pool.query(
      'SELECT payload FROM sessions WHERE id = $1',
      [sessionId],
    );
    if (result.rowCount === 0) return null;
    return result.rows[0].payload as unknown;
  }

  async listSessions(limit = 30): Promise<SessionListItem[]> {
    await this.ensureReady();
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const result = await this.pool.query(
      `WITH runs AS (
         SELECT
           COALESCE(payload->>'sessionId', payload->'context'->>'sessionId', id) AS session_id,
           id,
           user_input,
           status,
           task_type,
           created_at,
           updated_at,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(payload->>'sessionId', payload->'context'->>'sessionId', id)
             ORDER BY created_at ASC
           ) AS first_rank,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(payload->>'sessionId', payload->'context'->>'sessionId', id)
             ORDER BY updated_at DESC
           ) AS latest_rank,
           COUNT(*) OVER (
             PARTITION BY COALESCE(payload->>'sessionId', payload->'context'->>'sessionId', id)
           ) AS run_count,
           MIN(created_at) OVER (
             PARTITION BY COALESCE(payload->>'sessionId', payload->'context'->>'sessionId', id)
           ) AS session_created_at,
           MAX(updated_at) OVER (
             PARTITION BY COALESCE(payload->>'sessionId', payload->'context'->>'sessionId', id)
           ) AS session_updated_at
         FROM sessions
       )
       SELECT
         latest.session_id,
         first.user_input,
         latest.status,
         latest.task_type,
         latest.session_created_at,
         latest.session_updated_at,
         latest.run_count
       FROM runs latest
       JOIN runs first ON first.session_id = latest.session_id AND first.first_rank = 1
       WHERE latest.latest_rank = 1
       ORDER BY latest.session_updated_at DESC
       LIMIT $1`,
      [safeLimit],
    );

    return result.rows.map((row) => ({
      id: row.session_id as string,
      userInput: (row.user_input as string | null) ?? '未命名任务',
      status: (row.status as string | null) ?? 'unknown',
      taskType: (row.task_type as string | null) ?? undefined,
      createdAt: new Date(row.session_created_at as string).toISOString(),
      updatedAt: new Date(row.session_updated_at as string).toISOString(),
      runCount: Number(row.run_count ?? 1),
    }));
  }

  async listSessionRuns(sessionId: string): Promise<unknown[]> {
    await this.ensureReady();
    const result = await this.pool.query(
      `SELECT payload FROM sessions
       WHERE id = $1
          OR payload->>'sessionId' = $1
          OR payload->'context'->>'sessionId' = $1
       ORDER BY created_at ASC`,
      [sessionId],
    );
    return result.rows.map((row) => row.payload as unknown);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    await this.ensureReady();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM model_preferences WHERE session_id = $1', [sessionId]);
      const result = await client.query(
        `DELETE FROM sessions
         WHERE id = $1
            OR payload->>'sessionId' = $1
            OR payload->'context'->>'sessionId' = $1`,
        [sessionId],
      );
      await client.query('COMMIT');
      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async loadConversation(sessionId: string): Promise<ConversationTurnRecord[]> {
    await this.ensureReady();
    const result = await this.pool.query(
      'SELECT turns FROM conversations WHERE session_id = $1',
      [sessionId],
    );
    if (result.rowCount === 0) return [];
    const turns = result.rows[0].turns as unknown;
    return Array.isArray(turns) ? (turns as ConversationTurnRecord[]) : [];
  }

  async saveConversation(sessionId: string, turns: ConversationTurnRecord[]): Promise<void> {
    await this.ensureReady();
    await this.pool.query(
      `INSERT INTO conversations (session_id, turns, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (session_id) DO UPDATE SET
         turns = EXCLUDED.turns,
         updated_at = NOW()`,
      [sessionId, JSON.parse(JSON.stringify(turns))],
    );
  }

  async deleteConversation(sessionId: string): Promise<void> {
    await this.ensureReady();
    await this.pool.query('DELETE FROM conversations WHERE session_id = $1', [sessionId]);
  }

  async loadModelPreference(sessionId: string): Promise<ModelPreferenceRecord | null> {
    await this.ensureReady();
    const result = await this.pool.query(
      'SELECT preference, updated_at FROM model_preferences WHERE session_id = $1',
      [sessionId],
    );
    if (result.rowCount === 0) return null;
    const preference = result.rows[0].preference as Partial<ModelPreferenceRecord>;
    return {
      ...preference,
      sessionId,
      updatedAt: new Date(result.rows[0].updated_at as string).toISOString(),
    };
  }

  async saveModelPreference(
    sessionId: string,
    preference: ModelPreferenceRecord,
  ): Promise<void> {
    await this.ensureReady();
    const payload = JSON.parse(JSON.stringify({ ...preference, sessionId })) as unknown;
    await this.pool.query(
      `INSERT INTO model_preferences (session_id, preference, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (session_id) DO UPDATE SET
         preference = EXCLUDED.preference,
         updated_at = NOW()`,
      [sessionId, payload],
    );
  }

  async deleteModelPreference(sessionId: string): Promise<void> {
    await this.ensureReady();
    await this.pool.query('DELETE FROM model_preferences WHERE session_id = $1', [sessionId]);
  }

  async listToolCalls(sessionId: string): Promise<ToolCallRecord[]> {
    await this.ensureReady();
    const result = await this.pool.query(
      `SELECT id, step_id, tool_name, input, output, success, error, started_at, completed_at
       FROM tool_calls WHERE session_id = $1 ORDER BY started_at ASC`,
      [sessionId],
    );

    return result.rows.map((row) => ({
      id: row.id as string,
      stepId: row.step_id as string,
      toolName: row.tool_name as string,
      input: row.input as Record<string, unknown>,
      output: row.output ?? undefined,
      success: row.success as boolean,
      error: row.error ?? undefined,
      startedAt: new Date(row.started_at as string).toISOString(),
      completedAt: row.completed_at
        ? new Date(row.completed_at as string).toISOString()
        : undefined,
    }));
  }

  async saveReport(report: SavedReport): Promise<SavedReport> {
    await this.ensureReady();
    await this.pool.query(
      `INSERT INTO reports (id, title, markdown, html, run_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         markdown = EXCLUDED.markdown,
         html = EXCLUDED.html,
         run_id = EXCLUDED.run_id,
         updated_at = EXCLUDED.updated_at`,
      [
        report.id,
        report.title,
        report.markdown ?? null,
        report.html ?? null,
        report.runId ?? null,
        report.createdAt,
        report.updatedAt,
      ],
    );
    return report;
  }

  async loadReport(reportId: string): Promise<SavedReport | null> {
    await this.ensureReady();
    const result = await this.pool.query(
      `SELECT id, title, markdown, html, run_id, created_at, updated_at
       FROM reports WHERE id = $1`,
      [reportId],
    );
    if (result.rowCount === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id as string,
      title: row.title as string,
      markdown: row.markdown ?? undefined,
      html: row.html ?? undefined,
      runId: row.run_id ?? undefined,
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }

  async listReports(): Promise<ReportListItem[]> {
    await this.ensureReady();
    const result = await this.pool.query(
      `SELECT id, title, created_at FROM reports ORDER BY created_at DESC`,
    );

    return result.rows.map((row) => ({
      id: row.id as string,
      title: row.title as string,
      createdAt: new Date(row.created_at as string).toISOString(),
    }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export async function probePostgresConnection(connectionString: string): Promise<void> {
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
  } finally {
    await pool.end();
  }
}
