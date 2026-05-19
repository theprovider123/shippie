import { useMemo, useState } from 'react';

export interface MvpCandidate {
  id: string;
  name: string;
  /** Optional team code for color accent. */
  teamCode?: string;
}

export interface MvpBallot {
  voterId: string;
  candidateId: string;
  ts: number;
}

/**
 * MvpVote — post-match Player-Of-The-Match poll across peers.
 *
 * Renders the candidate list, lets a single peer cast one ballot (last
 * write wins), and shows running totals. The winner — used by the full-
 * time keepsake template — is the candidate with the most ballots; ties
 * are broken by earliest received.
 *
 * Wiring lives in HostMatchday / GuestMatchday — they relay ballots via
 * the existing relay-gossip transport. This component is presentation
 * plus the local "I voted" guard.
 */
export function MvpVote(props: {
  candidates: ReadonlyArray<MvpCandidate>;
  ballots: ReadonlyArray<MvpBallot>;
  selfPeerId: string;
  onVote: (candidateId: string) => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const myBallot = useMemo(
    () => props.ballots.find((b) => b.voterId === props.selfPeerId),
    [props.ballots, props.selfPeerId],
  );

  const tally = useMemo(() => tallyMvpBallots(props.ballots), [props.ballots]);
  const total = props.ballots.length;

  return (
    <section className="mvp-vote" aria-label="Player of the match">
      <header className="mvp-vote__head">
        <span className="eyebrow">Full-time vote</span>
        <h2>Player of the match</h2>
      </header>
      <ul className="mvp-vote__list" role="list">
        {props.candidates.map((candidate) => {
          const count = tally.get(candidate.id) ?? 0;
          const share = total === 0 ? 0 : count / total;
          const mine = myBallot?.candidateId === candidate.id;
          return (
            <li key={candidate.id} className={`mvp-vote__row${mine ? ' is-mine' : ''}`}>
              <button
                type="button"
                disabled={props.disabled}
                onClick={() => props.onVote(candidate.id)}
                onMouseEnter={() => setHovered(candidate.id)}
                onMouseLeave={() => setHovered((current) => (current === candidate.id ? null : current))}
                aria-pressed={mine}
                data-testid={`mvp-vote-${candidate.id}`}
              >
                <span className="mvp-vote__name">{candidate.name}</span>
                <span className="mvp-vote__bar" aria-hidden>
                  <span style={{ width: `${Math.round(share * 100)}%` }} />
                </span>
                <span className="mvp-vote__count">{count}</span>
              </button>
              {hovered === candidate.id ? null : null}
            </li>
          );
        })}
      </ul>
      <p className="mvp-vote__footer">
        {total === 0
          ? 'Cast the first ballot.'
          : `${total} ${total === 1 ? 'ballot' : 'ballots'} in.`}
      </p>
    </section>
  );
}

export function tallyMvpBallots(ballots: ReadonlyArray<MvpBallot>): Map<string, number> {
  const last = new Map<string, MvpBallot>();
  for (const ballot of ballots) {
    const existing = last.get(ballot.voterId);
    if (!existing || existing.ts < ballot.ts) last.set(ballot.voterId, ballot);
  }
  const counts = new Map<string, number>();
  for (const ballot of last.values()) {
    counts.set(ballot.candidateId, (counts.get(ballot.candidateId) ?? 0) + 1);
  }
  return counts;
}

export function mvpWinner(
  candidates: ReadonlyArray<MvpCandidate>,
  ballots: ReadonlyArray<MvpBallot>,
): MvpCandidate | null {
  if (ballots.length === 0 || candidates.length === 0) return null;
  const tally = tallyMvpBallots(ballots);
  let best: { id: string; count: number; firstSeen: number } | null = null;
  for (const [id, count] of tally) {
    const firstSeen = Math.min(...ballots.filter((b) => b.candidateId === id).map((b) => b.ts));
    if (!best || count > best.count || (count === best.count && firstSeen < best.firstSeen)) {
      best = { id, count, firstSeen };
    }
  }
  if (!best) return null;
  return candidates.find((c) => c.id === best!.id) ?? null;
}
