import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function runCommand(
  command: string,
  cwd: string,
  timeoutMs = 300_000,
): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let output = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, output });
    });
  });
}

export async function killPort(port: number): Promise<void> {
  if (process.platform === 'win32') {
    try {
      const { execSync } = await import('node:child_process');
      const result = execSync('netstat -ano', { encoding: 'utf-8' });
      for (const line of result.split('\n')) {
        if (!line.includes('LISTENING') || !line.includes(`:${port}`)) continue;
        const pid = line.trim().split(/\s+/).at(-1);
        if (pid && /^\d+$/.test(pid)) {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        }
      }
    } catch {
      // Port cleanup is best-effort.
    }
    return;
  }

  try {
    await runCommand(`fuser -k ${port}/tcp`, process.cwd(), 10_000);
  } catch {
    // Port cleanup is best-effort.
  }
}

let activeDev: { projectDir: string; port: number } | null = null;

export function getActiveDevServer(): { projectDir: string; port: number; devUrl: string } | null {
  if (!activeDev) return null;
  return {
    ...activeDev,
    devUrl: `http://localhost:${activeDev.port}/`,
  };
}

export async function startDevServer(projectDir: string, port: number): Promise<string> {
  await killPort(port);
  activeDev = { projectDir, port };

  // Fire-and-forget dev server; wait separately until the port is reachable.
  spawn('npm', ['run', 'dev', '--', '--host', '0.0.0.0', '--port', String(port)], {
    cwd: projectDir,
    shell: true,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();

  await waitForPort(port, 30_000);
  return `http://localhost:${port}/`;
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortListening(port)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Dev server did not start listening on port ${port} within ${timeoutMs}ms`);
}

async function isPortListening(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
    return response.ok || response.status < 500;
  } catch {
    if (process.platform === 'win32') {
      try {
        const { execSync } = await import('node:child_process');
        const result = execSync('netstat -ano', { encoding: 'utf-8' });
        return result.split('\n').some((line) => line.includes('LISTENING') && line.includes(`:${port}`));
      } catch {
        return false;
      }
    }
    return false;
  }
}

export async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(from, to);
    } else {
      await fs.copyFile(from, to);
    }
  }
}
