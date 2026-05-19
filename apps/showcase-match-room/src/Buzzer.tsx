import { useMemo } from 'react';
import type { ScorePoll, ScoreTally } from './shared/types.ts';

/**
 * Buzzer — peer-fair goal-prediction poll-close logic.
 *
 * The traditional matchday poll closes on a host clock (`closesAt`). That
 * isn't fair when the host's phone goes to sleep or the network drops. We
 * close polls when a strict majority of connected peers (`floor(N/2)+1`,
 * with `N >= 2`) have voted, then mark them "PEER-LOCKED".
 *
 * This component is presentation + the consensus rule, exported pure for
 * testing. The host wires it to its existing `closeScorePoll` action.
 */

export function consensusThreshold(connectedPeerCount: number): number {
  if (connectedPeerCount < 2) return Number.POSITIVE_INFINITY;
  return Math.floor(connectedPeerCount / 2) + 1;
}

export function isPeerLocked(poll: ScorePoll, tally: ScoreTally | undefined, connectedPeerCount: number): boolean {
  const threshold = consensusThreshold(connectedPeerCount);
  if (!Number.isFinite(threshold)) return false;
  const votes = tally?.totalVotes ?? 0;
  return votes >= threshold;
}

export function Buzzer(props: {
  poll: ScorePoll;
  tally: ScoreTally | undefined;
  connectedPeerCount: number;
  /** Called once when consensus is reached; host should close the poll. */
  onLock?: (pollId: string) => void;
}) {
  const peerLocked = isPeerLocked(props.poll, props.tally, props.connectedPeerCount);
  const threshold = consensusThreshold(props.connectedPeerCount);
  const votes = props.tally?.totalVotes ?? 0;

  // Fire the lock callback exactly once per poll when the consensus
  // threshold is crossed. We rely on the parent dedup'ing (closed polls
  // disappear from the open list) — no internal state needed.
  useMemo(() => {
    if (peerLocked && props.onLock) props.onLock(props.poll.id);
  }, [peerLocked, props.onLock, props.poll.id]);

  return (
    <div className="buzzer" data-testid={`buzzer-${props.poll.id}`}>
      <div className="buzzer__meta">
        <span className="buzzer__question">{props.poll.question}</span>
        <span className="buzzer__progress">
          {votes} / {Number.isFinite(threshold) ? threshold : '∞'}
        </span>
      </div>
      {peerLocked ? (
        <span className="buzzer__badge" data-testid="peer-locked-badge">
          PEER-LOCKED
        </span>
      ) : (
        <span className="buzzer__hint">Closes when a majority votes</span>
      )}
    </div>
  );
}
