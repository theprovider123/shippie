/**
 * SyncStatus — visible diagnostic for the cross-device relay.
 *
 * Renders a colored dot + a one-line status, then a "Sync now" button
 * that force-reconnects the WebSocket and re-pushes the full state
 * vector. Used in MorePage so the user can see at a glance whether
 * their two phones are actually talking, and trigger a manual sync if
 * something looks off.
 *
 * Color semantics:
 *   sage  (green) — open + a peer is on the other end
 *   gold  (amber) — open but alone in the room (partner offline)
 *   amber (warn)  — connecting / reconnecting after disconnect
 *   rust  (red)   — closed / error
 */
import { Button } from '@/components/ui/button.tsx';
import type { RelayProvider } from '@/sync/relay-provider.ts';
import { useRelayState } from '@/sync/useRelayState.ts';

interface Props {
  relay: RelayProvider | null;
}

function fmtAgo(at: number | null): string {
  if (!at) return 'never';
  const ms = Date.now() - at;
  if (ms < 1000) return 'just now';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

export function SyncStatus({ relay }: Props) {
  const state = useRelayState(relay);

  if (!relay || !state) {
    return (
      <div className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
        <p className="font-mono uppercase tracking-wider">Sync · offline only</p>
        <p>WebSocket sync isn't enabled in this build. Local data is safe.</p>
      </div>
    );
  }

  const dotColor =
    state.status === 'open' && state.peerCount > 0
      ? 'bg-[var(--sage,#7A9A6E)]'
      : state.status === 'open'
        ? 'bg-[var(--gold,#E8C547)]'
        : state.status === 'connecting'
          ? 'bg-[var(--gold,#E8C547)] animate-pulse'
          : 'bg-[var(--destructive,#E8603C)]';

  const headline =
    state.status === 'open' && state.peerCount > 0
      ? 'Connected · partner is online'
      : state.status === 'open'
        ? 'Connected · waiting for partner'
        : state.status === 'connecting'
          ? 'Connecting…'
          : 'Disconnected';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} aria-hidden />
        <p className="text-sm font-medium">{headline}</p>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs font-mono text-[var(--muted-foreground)]">
        <dt>Peers</dt>
        <dd>{state.peerCount}</dd>
        <dt>Last activity</dt>
        <dd>{fmtAgo(state.lastActivity)}</dd>
        {state.lastError ? (
          <>
            <dt>Last error</dt>
            <dd className="break-all text-[var(--destructive,#E8603C)]">
              {state.lastError.message}
            </dd>
          </>
        ) : null}
        <dt>Device id</dt>
        <dd className="break-all">{state.peerId}</dd>
      </dl>

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => relay.resync()}
        >
          Sync now
        </Button>
      </div>
    </div>
  );
}
