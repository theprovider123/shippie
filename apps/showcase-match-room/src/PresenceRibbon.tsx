import { useMemo } from 'react';
import { teamByCode } from './data/tournament.ts';

export interface PresencePeer {
  /** Stable peer id from the relay-gossip transport. */
  peerId: string;
  /** Optional display name; falls back to a 2-letter slug of the peer id. */
  displayName?: string | null;
  /** Optional 3-letter FIFA-style code mapped to a tournament team. */
  teamCode?: string | null;
  /** True if this peer cast the most recent vote/shout we've seen. */
  votedLast?: boolean;
}

/**
 * PresenceRibbon — persistent strip below the header that shows who's in
 * the room. Each peer is rendered as a circular initials chip with a
 * team-color dot, and the most-recent voter gets a "voted last" mark.
 *
 * The data shape is intentionally permissive: callers pass whatever they
 * have from the gossip transport (peer ids are mandatory; everything else
 * is derived or optional). This component never opens a connection of its
 * own — it strictly renders presence state.
 */
export function PresenceRibbon(props: {
  peers: ReadonlyArray<PresencePeer>;
  selfPeerId?: string | null;
}) {
  const ordered = useMemo(() => {
    const list = [...props.peers];
    // Self goes first so the user always sees themselves at the head of
    // the ribbon — feels less anonymous in a 12-peer room.
    list.sort((a, b) => {
      if (a.peerId === props.selfPeerId) return -1;
      if (b.peerId === props.selfPeerId) return 1;
      return 0;
    });
    return list;
  }, [props.peers, props.selfPeerId]);

  if (ordered.length === 0) {
    return (
      <aside className="presence-ribbon presence-ribbon--empty" aria-label="No peers connected yet">
        <span className="presence-ribbon__empty">Waiting for peers…</span>
      </aside>
    );
  }

  return (
    <aside className="presence-ribbon" aria-label={`${ordered.length} ${ordered.length === 1 ? 'peer' : 'peers'} in the room`}>
      <ul className="presence-ribbon__list" role="list">
        {ordered.map((peer) => {
          const initials = deriveInitials(peer);
          const team = peer.teamCode ? safeTeam(peer.teamCode) : null;
          const dotStyle = team ? { background: team.swatch[0] } : undefined;
          const isSelf = peer.peerId === props.selfPeerId;
          return (
            <li
              key={peer.peerId}
              className={`presence-ribbon__peer${isSelf ? ' is-self' : ''}${peer.votedLast ? ' has-voted' : ''}`}
              title={peer.displayName ?? peer.peerId.slice(-6)}
              data-testid={`presence-${peer.peerId}`}
            >
              <span className="presence-ribbon__chip" aria-hidden>
                <span className="presence-ribbon__dot" style={dotStyle} aria-hidden />
                <strong>{initials}</strong>
              </span>
              {peer.votedLast ? <span className="presence-ribbon__voted">voted last</span> : null}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function deriveInitials(peer: PresencePeer): string {
  if (peer.displayName) {
    const words = peer.displayName.trim().split(/\s+/);
    const first = words[0]?.[0] ?? '';
    const second = words[1]?.[0] ?? words[0]?.[1] ?? '';
    return (first + second).toUpperCase() || '··';
  }
  const slug = peer.peerId.replace(/[^a-z0-9]/gi, '');
  return slug.slice(-2).toUpperCase() || '··';
}

function safeTeam(code: string): ReturnType<typeof teamByCode> | null {
  try {
    return teamByCode(code);
  } catch {
    return null;
  }
}
