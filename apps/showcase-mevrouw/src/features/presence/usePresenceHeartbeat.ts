import { useEffect } from 'react';
import type * as Y from 'yjs';
import { HEARTBEAT_INTERVAL_MS, pingPresence } from './presence-state.ts';

/**
 * Beats once on mount, then every 5s while the tab is visible.
 * Pauses when hidden so a backgrounded tab stops claiming "online".
 */
export function usePresenceHeartbeat(doc: Y.Doc, deviceId: string): void {
  useEffect(() => {
    let timer: number | null = null;
    let stopped = false;

    function beat() {
      if (stopped) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      pingPresence(doc, deviceId);
    }

    beat();
    timer = window.setInterval(beat, HEARTBEAT_INTERVAL_MS);

    function onVisibility() {
      if (document.visibilityState === 'visible') beat();
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [doc, deviceId]);
}
