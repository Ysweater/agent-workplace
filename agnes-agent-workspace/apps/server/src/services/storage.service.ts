import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JsonFileStorage } from './storage/json.adapter.js';
import { PostgresStorage, probePostgresConnection } from './storage/postgres.adapter.js';
import type {
  ReportListItem,
  SavedReport,
  SessionListItem,
  StorageAdapter,
  StorageStatus,
} from './storage/types.js';

export type { ReportListItem, SavedReport, SessionListItem, StorageAdapter, StorageStatus };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveStorageRoot(): string {
  const fromEnv = process.env.STORAGE_PATH?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(__dirname, '../../../../storage');
}

function shouldUsePostgres(): boolean {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return false;

  const driver = (process.env.STORAGE_DRIVER ?? 'json').toLowerCase();
  if (driver === 'json') return false;

  return driver === 'postgres' || driver === 'auto';
}

let activeAdapter: StorageAdapter = new JsonFileStorage(resolveStorageRoot());
let initPromise: Promise<StorageAdapter> | null = null;

function wrapWithFallback(inner: StorageAdapter, fallback: JsonFileStorage): StorageAdapter {
  const jsonFallback = fallback;
  let usingFallback = false;

  const tryOp = async <T>(op: () => Promise<T>, fallbackOp: () => Promise<T>): Promise<T> => {
    if (usingFallback) return fallbackOp();
    try {
      return await op();
    } catch (err) {
      usingFallback = true;
      console.warn(
        '[storage] PostgreSQL operation failed, degrading to JSON:',
        err instanceof Error ? err.message : err,
      );
      return fallbackOp();
    }
  };

  return {
    getStatus(): StorageStatus {
      if (usingFallback) {
        return { ...jsonFallback.getStatus(), fallback: true, detail: 'PostgreSQL degraded to JSON' };
      }
      return inner.getStatus();
    },
    saveSession: (id, data) =>
      tryOp(() => inner.saveSession(id, data), () => jsonFallback.saveSession(id, data)),
    loadSession: (id) =>
      tryOp(() => inner.loadSession(id), () => jsonFallback.loadSession(id)),
    listSessions: (limit) =>
      tryOp(() => inner.listSessions(limit), () => jsonFallback.listSessions(limit)),
    listSessionRuns: (id) =>
      tryOp(() => inner.listSessionRuns(id), () => jsonFallback.listSessionRuns(id)),
    deleteSession: (id) =>
      tryOp(() => inner.deleteSession(id), () => jsonFallback.deleteSession(id)),
    loadConversation: (id) =>
      tryOp(() => inner.loadConversation(id), () => jsonFallback.loadConversation(id)),
    saveConversation: (id, turns) =>
      tryOp(() => inner.saveConversation(id, turns), () => jsonFallback.saveConversation(id, turns)),
    deleteConversation: (id) =>
      tryOp(() => inner.deleteConversation(id), () => jsonFallback.deleteConversation(id)),
    loadModelPreference: (id) =>
      tryOp(() => inner.loadModelPreference(id), () => jsonFallback.loadModelPreference(id)),
    saveModelPreference: (id, preference) =>
      tryOp(
        () => inner.saveModelPreference(id, preference),
        () => jsonFallback.saveModelPreference(id, preference),
      ),
    deleteModelPreference: (id) =>
      tryOp(() => inner.deleteModelPreference(id), () => jsonFallback.deleteModelPreference(id)),
    listToolCalls: (id) =>
      tryOp(() => inner.listToolCalls(id), () => jsonFallback.listToolCalls(id)),
    saveReport: (report) =>
      tryOp(() => inner.saveReport(report), () => jsonFallback.saveReport(report)),
    loadReport: (id) =>
      tryOp(() => inner.loadReport(id), () => jsonFallback.loadReport(id)),
    listReports: () =>
      tryOp(() => inner.listReports(), () => jsonFallback.listReports()),
    close: async () => {
      await inner.close().catch(() => undefined);
      await jsonFallback.close();
    },
  };
}

/**
 * Initialize storage — call once at server startup.
 * Tries PostgreSQL when DATABASE_URL is set and STORAGE_DRIVER=postgres|auto.
 * Falls back to local JSON on connection failure.
 */
export async function initializeStorage(): Promise<StorageAdapter> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const jsonStorage = new JsonFileStorage(resolveStorageRoot());
    const databaseUrl = process.env.DATABASE_URL?.trim();

    if (!shouldUsePostgres() || !databaseUrl) {
      activeAdapter = jsonStorage;
      console.log(`[storage] using JSON files at ${resolveStorageRoot()}`);
      return activeAdapter;
    }

    try {
      await probePostgresConnection(databaseUrl);
      const postgres = new PostgresStorage(databaseUrl);
      await postgres.listReports();
      activeAdapter = wrapWithFallback(postgres, jsonStorage);
      console.log('[storage] using PostgreSQL (with JSON fallback)');
      return activeAdapter;
    } catch (err) {
      console.warn(
        '[storage] PostgreSQL connection failed, using JSON:',
        err instanceof Error ? err.message : err,
      );
      activeAdapter = jsonStorage;
      return activeAdapter;
    }
  })();

  return initPromise;
}

export function getStorageService(): StorageAdapter {
  return activeAdapter;
}

/** Proxy — controllers import this; ensure initializeStorage() runs at startup first */
export const storageService: StorageAdapter = new Proxy({} as StorageAdapter, {
  get(_target, prop: keyof StorageAdapter) {
    const adapter = getStorageService();
    const value = adapter[prop];
    return typeof value === 'function' ? value.bind(adapter) : value;
  },
});
