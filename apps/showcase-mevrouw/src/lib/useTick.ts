import { useEffect, useState } from 'react';

/**
 * Returns Date.now() at every tick. Use sparingly — re-renders
 * the whole subtree. Good for liveness windows ("seen within 15s").
 */
export function useTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}
