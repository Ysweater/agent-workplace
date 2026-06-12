import { useEffect, useState } from 'react';
import type { HealthStatus } from '../types/agent';

export function useHealth(pollMs = 15_000) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let active = true;

    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/health');
        const raw = await res.text();
        if (!res.ok || !raw.trim()) throw new Error('health check failed');
        const data = JSON.parse(raw) as HealthStatus;
        if (active) {
          setHealth(data);
          setConnected(true);
        }
      } catch {
        if (active) {
          setConnected(false);
        }
      }
    };

    void fetchHealth();
    const id = setInterval(() => void fetchHealth(), pollMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return { health, connected };
}
