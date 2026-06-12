import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, '.env') });

const base = process.env.CATALOG_URL ?? 'http://localhost:3001';

async function waitForServer(maxMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

if (!(await waitForServer())) {
  console.error('Server not ready at', base);
  process.exit(1);
}

const res = await fetch(`${base}/api/models/catalog?test=1`);
const data = await res.json();
for (const item of data.items) {
  console.log(`[${item.status}] ${item.id} (${item.capability}) — ${item.statusMessage ?? ''}`);
}
console.log('active:', data.active?.label ?? data.active?.model);
