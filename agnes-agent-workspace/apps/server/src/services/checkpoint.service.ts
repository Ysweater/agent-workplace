import net from 'node:net';

export interface RunCheckpoint {
  runId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  workflowName: string;
  currentNodeId?: string;
  completedNodeIds: string[];
  pendingNodeIds: string[];
  updatedAt: string;
  error?: string;
}

const memoryCheckpoints = new Map<string, RunCheckpoint>();
const KEY_PREFIX = 'agnes:run:checkpoint:';

function redisUrl(): URL | null {
  const raw = process.env.REDIS_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function encodeResp(args: string[]): string {
  return `*${args.length}\r\n${args.map((arg) => `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`).join('')}`;
}

function parseResp(raw: string): string | number | null {
  const prefix = raw[0];
  if (prefix === '+') return raw.slice(1).split('\r\n')[0] ?? '';
  if (prefix === ':') return Number(raw.slice(1).split('\r\n')[0] ?? 0);
  if (prefix === '$') {
    const [lenLine, ...rest] = raw.slice(1).split('\r\n');
    const len = Number(lenLine);
    if (len < 0) return null;
    return rest.join('\r\n').slice(0, len);
  }
  if (prefix === '-') {
    throw new Error(raw.slice(1).split('\r\n')[0] ?? 'Redis error');
  }
  return raw;
}

async function redisCommand(args: string[]): Promise<string | number | null> {
  const url = redisUrl();
  if (!url) throw new Error('REDIS_URL is not configured');
  const port = Number(url.port || 6379);
  const host = url.hostname;
  const password = decodeURIComponent(url.password || '');
  const username = decodeURIComponent(url.username || '');
  const db = url.pathname.replace('/', '');

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let buffer = '';
    const commands: string[][] = [];
    if (password) commands.push(username ? ['AUTH', username, password] : ['AUTH', password]);
    if (db) commands.push(['SELECT', db]);
    commands.push(args);

    let index = 0;
    const sendNext = () => {
      if (index >= commands.length) return;
      socket.write(encodeResp(commands[index]));
    };

    socket.setTimeout(2500);
    socket.on('connect', sendNext);
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf-8');
      try {
        const parsed = parseResp(buffer);
        buffer = '';
        index += 1;
        if (index >= commands.length) {
          socket.end();
          resolve(parsed);
        } else {
          sendNext();
        }
      } catch (err) {
        socket.destroy();
        reject(err);
      }
    });
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Redis command timeout'));
    });
    socket.on('error', reject);
  });
}

function key(runId: string): string {
  return `${KEY_PREFIX}${runId}`;
}

export async function saveRunCheckpoint(checkpoint: RunCheckpoint): Promise<void> {
  memoryCheckpoints.set(checkpoint.runId, checkpoint);
  if (!redisUrl()) return;
  try {
    await redisCommand(['SET', key(checkpoint.runId), JSON.stringify(checkpoint), 'EX', '86400']);
  } catch (err) {
    console.warn('[checkpoint] Redis save failed, using memory fallback:', err instanceof Error ? err.message : err);
  }
}

export async function loadRunCheckpoint(runId: string): Promise<RunCheckpoint | null> {
  const fromMemory = memoryCheckpoints.get(runId);
  if (fromMemory) return fromMemory;
  if (!redisUrl()) return null;
  try {
    const raw = await redisCommand(['GET', key(runId)]);
    if (typeof raw !== 'string' || !raw) return null;
    const parsed = JSON.parse(raw) as RunCheckpoint;
    memoryCheckpoints.set(runId, parsed);
    return parsed;
  } catch (err) {
    console.warn('[checkpoint] Redis load failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function deleteRunCheckpoint(runId: string): Promise<void> {
  memoryCheckpoints.delete(runId);
  if (!redisUrl()) return;
  try {
    await redisCommand(['DEL', key(runId)]);
  } catch {
    // best effort cleanup
  }
}

export function getCheckpointStatus() {
  return {
    driver: redisUrl() ? 'redis' : 'memory',
    configured: Boolean(redisUrl()),
    detail: redisUrl()
      ? 'Redis checkpoint store enabled'
      : 'Using in-memory checkpoints; set REDIS_URL for cloud resume',
  };
}
