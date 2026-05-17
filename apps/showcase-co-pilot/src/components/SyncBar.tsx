/**
 * Sync indicator + "Sync now" affordance.
 *
 * The voice doc requires errors that are useful, not blameful. The
 * "haven't synced in N hours" copy is neutral — it describes a fact
 * about the connection, not a fact about the other parent.
 */
import type { RelayState } from '../sync/relay-provider.ts';

interface Props {
  state: RelayState | null;
  onResync: () => void;
}

function fmtAgo(ms: number, now = Date.now()): string {
  const diff = now - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function SyncBar({ state, onResync }: Props) {
  const status = state?.status ?? 'connecting';
  const peers = state?.peerCount ?? 0;
  const lastFmt = state?.lastActivity ? fmtAgo(state.lastActivity) : null;
  return (
    <div className="co-sync-bar" data-status={status}>
      <span className="co-sync-dot" aria-hidden="true" />
      <span>
        {status === 'open'
          ? peers > 0
            ? `Synced · ${peers} other device`
            : 'Synced · waiting for the other phone'
          : status === 'connecting'
            ? 'Connecting…'
            : 'Offline'}
      </span>
      {lastFmt ? <span className="co-row-end">last activity {lastFmt}</span> : null}
      <button
        type="button"
        className="co-btn"
        data-size="sm"
        data-variant="ghost"
        onClick={onResync}
      >
        Sync now
      </button>
    </div>
  );
}
