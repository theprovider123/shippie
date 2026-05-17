import type { RelayState } from '../sync/relay-provider.ts';

interface Props {
  state: RelayState | null;
  onResync: () => void;
}

export function SyncBar({ state, onResync }: Props) {
  const status = state?.status ?? 'connecting';
  const peers = state?.peerCount ?? 0;
  return (
    <div className="atlas-sync-bar" data-status={status}>
      <span>
        {!state
          ? 'Solo trip'
          : status === 'open'
            ? peers > 0
              ? `Synced · ${peers} companion`
              : 'Synced · waiting for companion'
            : status === 'connecting'
              ? 'Connecting…'
              : 'Offline'}
      </span>
      {state ? (
        <button type="button" className="atlas-btn atlas-btn-ghost" onClick={onResync}>
          Sync now
        </button>
      ) : null}
    </div>
  );
}
