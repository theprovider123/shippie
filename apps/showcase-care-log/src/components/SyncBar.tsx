/**
 * Sync indicator — neutral copy. "Solo" if there's no relay (caregiver
 * is using Care Log alone). Otherwise reflects the live relay state.
 */
import type { RelayState } from '../sync/relay-provider.ts';

interface Props {
  state: RelayState | null;
  solo: boolean;
  onResync: () => void;
}

function fmtAgo(ms: number, now = Date.now()): string {
  const diff = now - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function SyncBar({ state, solo, onResync }: Props) {
  if (solo) {
    return (
      <div className="cl-sync-bar" data-status="solo">
        <span className="cl-sync-dot" aria-hidden="true" />
        <span>Solo · this phone only</span>
      </div>
    );
  }
  const status = state?.status ?? 'connecting';
  const peers = state?.peerCount ?? 0;
  const lastFmt = state?.lastActivity ? fmtAgo(state.lastActivity) : null;
  return (
    <div className="cl-sync-bar" data-status={status}>
      <span className="cl-sync-dot" aria-hidden="true" />
      <span>
        {status === 'open'
          ? peers > 0
            ? `Synced · ${peers} other caregiver`
            : 'Synced · waiting for the other caregiver'
          : status === 'connecting'
            ? 'Connecting…'
            : 'Offline'}
      </span>
      {lastFmt ? <span className="cl-row-end">last activity {lastFmt}</span> : null}
      <button
        type="button"
        className="cl-btn"
        data-size="sm"
        data-variant="ghost"
        onClick={onResync}
      >
        Sync now
      </button>
    </div>
  );
}
