import type { RelayState } from '../sync/relay-provider.ts';

interface Props {
  state: RelayState | null;
  onResync: () => void;
}

export function SyncBar({ state, onResync }: Props) {
  const status = state?.status ?? 'connecting';
  const peers = state?.peerCount ?? 0;
  return (
    <div className="tab-sync-bar" data-status={status}>
      <span>
        {status === 'open'
          ? peers > 0
            ? `Synced · ${peers} other`
            : 'Synced · waiting for the others'
          : status === 'connecting'
            ? 'Connecting…'
            : 'Offline'}
      </span>
      <button type="button" className="tab-btn tab-btn-ghost" onClick={onResync}>
        Sync now
      </button>
    </div>
  );
}
