/**
 * Phase 6 — Multi-hop epidemic gossip.
 *
 * Plumtree-flavoured broadcast: each message has a unique id; peers
 * forward unseen messages to a small fanout of neighbours; duplicates
 * are dropped. Messages decay via TTL (max-hop count) so the network
 * doesn't keep relaying forever.
 *
 * Why not full Plumtree (with eager-vs-lazy push optimisation)? At
 * tens-of-peers scale the pure-eager flood is fine — bandwidth is
 * cheap, complexity isn't. We can graduate to Plumtree's lazy lane
 * when real traffic exposes a bottleneck.
 *
 * **Defaults are provisional.** They're educated guesses tuned for
 * 5–50 peer rooms (typical Shippie group). Real launch traffic will
 * show whether fanout / TTL / dedupe-window need to change. Each
 * default is documented inline so the maker doesn't have to dig.
 */

export interface GossipMessage<T = unknown> {
  /** Unique-per-network message id. SHA-256 hex of payload + sender works. */
  id: string;
  /** Hop counter. Sender starts at 0; each forward increments. */
  hop: number;
  /** Wall-clock ms when the message was originated. Used for stale-drop. */
  originatedAt: number;
  /** Free-form payload — gossip doesn't care about shape. */
  payload: T;
  /** Origin peer id (for trace + cycle detection in pathological splits). */
  originPeerId: string;
}

export interface GossipPeer<T = unknown> {
  /** Stable id for this peer in the current network. */
  id: string;
  /** Ship a message to this peer. May reject; gossip retries on next tick. */
  send(message: GossipMessage<T>): Promise<void> | void;
}

export interface GossipOptions<T = unknown> {
  /**
   * How many neighbours to fan a fresh message out to. Default 4 — the
   * SWIM/Plumtree literature cluster around log2(N)+1; for 50 peers
   * that's ~7. We start lower to keep mobile bandwidth cheap.
   */
  fanout?: number;
  /**
   * Max hop count before drop. Default 6 — enough to traverse a 50-peer
   * mesh of avg degree 4 with margin.
   */
  maxHops?: number;
  /**
   * Dedupe window in ms. We remember message ids for this long so a
   * straggler peer that returns from offline can still suppress a
   * re-broadcast. Default 60s.
   */
  dedupeWindowMs?: number;
  /**
   * Wall-clock TTL — messages older than this are dropped on receive
   * even if id is fresh. Default 5min. Prevents zombie traffic from a
   * peer whose clock skew was huge.
   */
  staleAfterMs?: number;
  /** Pluggable RNG so tests get deterministic fanout selection. */
  rng?: () => number;
  /** Hook for per-message observability. Useful for tuning at scale. */
  onEvent?: (event: GossipEvent<T>) => void;
}

export type GossipEvent<T> =
  | { kind: 'broadcast'; message: GossipMessage<T> }
  | { kind: 'receive'; message: GossipMessage<T> }
  | { kind: 'duplicate'; messageId: string }
  | { kind: 'dropped'; messageId: string; reason: 'ttl' | 'stale' }
  | { kind: 'forwarded'; message: GossipMessage<T>; to: readonly string[] };

export interface GossipNode<T = unknown> {
  /** Originate a fresh message and broadcast it out. */
  broadcast(payload: T, peers: readonly GossipPeer<T>[]): Promise<GossipMessage<T>>;
  /** Process an incoming message from another node. */
  receive(message: GossipMessage<T>, peers: readonly GossipPeer<T>[]): Promise<void>;
  /** Subscribe to deduplicated, in-order delivery of broadcast payloads. */
  onDeliver(handler: (payload: T, message: GossipMessage<T>) => void): () => void;
  /** Snapshot — number of message ids currently in the dedupe window. */
  size(): number;
}

const DEFAULT_FANOUT = 4;
const DEFAULT_MAX_HOPS = 6;
const DEFAULT_DEDUPE_WINDOW_MS = 60_000;
const DEFAULT_STALE_AFTER_MS = 5 * 60_000;

export function createGossipNode<T = unknown>(
  selfPeerId: string,
  options: GossipOptions<T> = {},
): GossipNode<T> {
  const fanout = options.fanout ?? DEFAULT_FANOUT;
  const maxHops = options.maxHops ?? DEFAULT_MAX_HOPS;
  const dedupeWindow = options.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
  const staleAfter = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const rng = options.rng ?? Math.random;
  const seen = new Map<string, number>();
  const handlers = new Set<(payload: T, message: GossipMessage<T>) => void>();

  const pruneSeen = (now: number) => {
    for (const [id, addedAt] of seen) {
      if (now - addedAt > dedupeWindow) seen.delete(id);
    }
  };

  const sample = (peers: readonly GossipPeer<T>[], excludeIds: ReadonlySet<string>): GossipPeer<T>[] => {
    const eligible = peers.filter((p) => p.id !== selfPeerId && !excludeIds.has(p.id));
    if (eligible.length <= fanout) return eligible;
    // Fisher-Yates partial shuffle for a fanout-sized random sample.
    const arr = [...eligible];
    const out: GossipPeer<T>[] = [];
    for (let i = 0; i < fanout; i += 1) {
      const j = i + Math.floor(rng() * (arr.length - i));
      const picked = arr[j]!;
      arr[j] = arr[i]!;
      arr[i] = picked;
      out.push(picked);
    }
    return out;
  };

  const fanoutMessage = async (
    message: GossipMessage<T>,
    peers: readonly GossipPeer<T>[],
    skip: ReadonlySet<string>,
  ): Promise<readonly string[]> => {
    if (message.hop >= maxHops) {
      options.onEvent?.({ kind: 'dropped', messageId: message.id, reason: 'ttl' });
      return [];
    }
    const targets = sample(peers, skip);
    if (targets.length === 0) return [];
    const next: GossipMessage<T> = { ...message, hop: message.hop + 1 };
    await Promise.all(
      targets.map((p) =>
        Promise.resolve(p.send(next)).catch(() => undefined /* best-effort */),
      ),
    );
    options.onEvent?.({ kind: 'forwarded', message: next, to: targets.map((t) => t.id) });
    return targets.map((t) => t.id);
  };

  return {
    async broadcast(payload, peers) {
      const now = Date.now();
      pruneSeen(now);
      const message: GossipMessage<T> = {
        id: `m_${now}_${Math.floor(rng() * 1e9)}`,
        hop: 0,
        originatedAt: now,
        originPeerId: selfPeerId,
        payload,
      };
      seen.set(message.id, now);
      options.onEvent?.({ kind: 'broadcast', message });
      // Self-deliver — handlers should always see their own broadcasts.
      for (const h of handlers) h(payload, message);
      const skipSet = new Set([selfPeerId]);
      await fanoutMessage(message, peers, skipSet);
      return message;
    },
    async receive(message, peers) {
      const now = Date.now();
      pruneSeen(now);
      if (now - message.originatedAt > staleAfter) {
        options.onEvent?.({ kind: 'dropped', messageId: message.id, reason: 'stale' });
        return;
      }
      if (seen.has(message.id)) {
        options.onEvent?.({ kind: 'duplicate', messageId: message.id });
        return;
      }
      seen.set(message.id, now);
      options.onEvent?.({ kind: 'receive', message });
      for (const h of handlers) h(message.payload, message);
      const skipSet = new Set([selfPeerId, message.originPeerId]);
      await fanoutMessage(message, peers, skipSet);
    },
    onDeliver(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    size() {
      pruneSeen(Date.now());
      return seen.size;
    },
  };
}
