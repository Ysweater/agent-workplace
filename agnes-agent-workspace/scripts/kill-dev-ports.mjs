import { execSync } from 'node:child_process';

const PORTS = [3001, 5173, 5174, 5180];

function killOnWindows(port) {
  try {
    const out = execSync('netstat -ano', { encoding: 'utf-8' });
    const pids = new Set();
    for (const line of out.split('\n')) {
      if (!line.includes('LISTENING') || !line.includes(`:${port}`)) continue;
      const pid = line.trim().split(/\s+/).at(-1);
      if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        console.log(`[dev:kill] stopped PID ${pid} (port ${port})`);
      } catch {
        // ignore
      }
    }
  } catch (err) {
    console.warn(`[dev:kill] port ${port}:`, err instanceof Error ? err.message : err);
  }
}

if (process.platform === 'win32') {
  for (const port of PORTS) killOnWindows(port);
} else {
  for (const port of PORTS) {
    try {
      execSync(`fuser -k ${port}/tcp`, { stdio: 'ignore' });
      console.log(`[dev:kill] freed port ${port}`);
    } catch {
      // port not in use
    }
  }
}

console.log('[dev:kill] done — ports', PORTS.join(', '));
