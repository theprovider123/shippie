/**
 * useRelayState — React subscription to a RelayProvider's live state.
 *
 * The RelayProvider exposes a subscribe() that fires on every status,
 * peer count, and activity change. This hook bridges that to React's
 * render cycle so SyncStatus / "Sync now" UI re-renders on every
 * interesting event.
 */
import { useEffect, useState } from 'react';
import type { RelayProvider, RelayState } from './relay-provider.ts';

function snapshot(p: RelayProvider): RelayState {
  return {
    status: p.status,
    peerCount: p.peerCount,
    lastActivity: p.lastActivity,
    lastError: p.lastError,
    url: p.url,
    peerId: p.peerId,
  };
}

export function useRelayState(provider: RelayProvider | null): RelayState | null {
  const [state, setState] = useState<RelayState | null>(
    provider ? snapshot(provider) : null,
  );
  useEffect(() => {
    if (!provider) {
      setState(null);
      return;
    }
    setState(snapshot(provider));
    return provider.subscribe((s) => setState({ ...s }));
  }, [provider]);
  return state;
}
