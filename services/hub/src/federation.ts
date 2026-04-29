/**
 * Phase 6 — Hub-to-Hub federation.
 *
 * Two distinct fabrics:
 *
 *   1. **Same-LAN** — discovery via mDNS (bonjour service type
 *      `_shippie-hub._tcp`), trust via shared admin secret, sync via
 *      WebSocket. Fully buildable and runnable in a fixture today.
 *
 *   2. **Cross-LAN** — same protocol, but discovery happens by listing
 *      explicit peer URLs in `config.peers`. Cross-LAN reachability is
 *      a deployment concern (NAT, firewalls); the primitive runs the
 *      moment two reachable hubs are listed.
 *
 * Sync surface: each Hub publishes its installed-app catalogue + local
 * receipts as deltas. Peers replay deltas through the gossip layer so
 * a 5-Hub stadium converges in O(hops) rather than O(peers).
 *
 * Trust: every federation message is signed with the shared admin
 * secret (HMAC-SHA-256). Peers without the secret can't forge or
 * inject. Real venues should rotate the secret per event.
 *
 * NAT-traversal note: this module assumes peers can reach each other
 * by URL. For NATed deployments, layer in proximity's WebRTC peer-link
 * (the `@shippie/proximity` PeerLink already does TURN/STUN). That
 * upgrade is non-disruptive — the FederationLink interface stays the
 * same, only the underlying transport changes.
 */

import { createGossipNode, type GossipNode, type GossipPeer } from '@shippie/proximity';

export type FederationMessageKind =
  | 'hub.hello'
  | 'hub.catalog.delta'
  | 'hub.receipt.delta'
  | 'hub.heartbeat';

export interface FederationMessage<P = unknown> {
  kind: FederationMessageKind;
  hubId: string;
  payload: P;
  /** Wall-clock ms when the message was originated. */
  ts: number;
}

export interface SignedMessage<P = unknown> {
  message: FederationMessage<P>;
  /** HMAC-SHA-256 hex of message canonical JSON, keyed by adminSecret. */
  sig: string;
}

export interface CatalogEntry {
  appId: string;
  slug: string;
  version: string;
  packageHash: string;
  /** Where the package can be fetched on the originating hub. */
  fetchUrl: string;
}

export interface ReceiptDelta {
  appId: string;
  packageHash: string;
  installedAt: string;
  receiptHash: string;
}

export interface FederationPeer {
  /** Stable peer identifier — typically `<hubId>@<host>`. */
  id: string;
  /** Reachable URL (HTTP or HTTPS). */
  url: string;
  /** Last successful contact (ms since epoch), 0 if never. */
  lastSeenAt: number;
}

export interface FederationOptions {
  /** This hub's stable id. Survives restarts; the bootstrapper assigns. */
  hubId: string;
  /** Shared admin secret used to HMAC every message. Rotate per event. */
  adminSecret: string;
  /** Static peer URLs (cross-LAN). mDNS discovery extends this list at runtime. */
  staticPeers?: readonly string[];
  /** Optional sign function injection (tests pass a stub). */
  sign?: (message: FederationMessage, secret: string) => Promise<string>;
  /** Optional verify function injection. */
  verify?: (signed: SignedMessage, secret: string) => Promise<boolean>;
  /** Hook for instrumentation. */
  onEvent?: (event: FederationEvent) => void;
}

export type FederationEvent =
  | { kind: 'peer-discovered'; peer: FederationPeer }
  | { kind: 'peer-lost'; peerId: string }
  | { kind: 'message-out'; signed: SignedMessage }
  | { kind: 'message-in'; signed: SignedMessage }
  | { kind: 'message-rejected'; reason: 'bad-sig' | 'stale' };

export interface FederationLink {
  /** Add a peer URL (cross-LAN bootstrap or mDNS discovery). */
  addPeer(url: string): void;
  /** Drop a peer. */
  removePeer(peerId: string): void;
  /** Currently-known peers, freshest first. */
  peers(): readonly FederationPeer[];
  /** Publish a catalog delta to all peers. */
  publishCatalog(entries: readonly CatalogEntry[]): Promise<void>;
  /** Publish a receipt delta to all peers. */
  publishReceipt(delta: ReceiptDelta): Promise<void>;
  /** Receive an inbound signed message from a peer (e.g. WS frame). */
  ingest(raw: string): Promise<void>;
  /** Subscribe to delivered messages by kind. */
  onMessage<P = unknown>(
    kind: FederationMessageKind,
    handler: (message: FederationMessage<P>) => void,
  ): () => void;
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const STALE_PEER_AFTER_MS = 90_000;

export function createFederationLink(options: FederationOptions): FederationLink {
  const { hubId, adminSecret } = options;
  const sign = options.sign ?? defaultSign;
  const verify = options.verify ?? defaultVerify;
  const peers = new Map<string, FederationPeer>();
  for (const url of options.staticPeers ?? []) {
    peers.set(url, { id: url, url, lastSeenAt: 0 });
  }
  const handlers = new Map<FederationMessageKind, Set<(m: FederationMessage) => void>>();

  const gossip: GossipNode<SignedMessage> = createGossipNode<SignedMessage>(hubId, {
    onEvent: (e) => {
      if (e.kind === 'forwarded') {
        for (const targetId of e.to) {
          options.onEvent?.({
            kind: 'message-out',
            signed: e.message.payload,
          });
          void deliverToPeer(targetId, e.message.payload);
        }
      }
    },
  });

  // Each FederationPeer becomes a GossipPeer whose `send` POSTs JSON
  // to the peer's URL. The actual transport is hub-side; tests inject
  // a stub via the staticPeers list with localhost URLs.
  const gossipPeerFor = (peer: FederationPeer): GossipPeer<SignedMessage> => ({
    id: peer.id,
    send: async (message) => {
      // gossip handles the broadcast envelope; we send the embedded
      // SignedMessage straight through.
      await deliverToPeer(peer.id, message.payload);
    },
  });

  const fanoutPeers = (): GossipPeer<SignedMessage>[] =>
    [...peers.values()].map((p) => gossipPeerFor(p));

  async function deliverToPeer(peerId: string, signed: SignedMessage): Promise<void> {
    const peer = peers.get(peerId);
    if (!peer) return;
    try {
      const res = await fetch(`${peer.url.replace(/\/$/, '')}/__shippie/federation`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(signed),
      });
      if (res.ok) {
        peer.lastSeenAt = Date.now();
      }
    } catch {
      /* network errors are best-effort; gossip retries via fanout */
    }
  }

  async function broadcastSigned<P>(message: FederationMessage<P>): Promise<void> {
    const sig = await sign(message, adminSecret);
    const signed: SignedMessage<P> = { message, sig };
    options.onEvent?.({ kind: 'message-out', signed: signed as SignedMessage });
    await gossip.broadcast(signed as SignedMessage, fanoutPeers());
  }

  return {
    addPeer(url) {
      const id = url;
      if (peers.has(id)) return;
      const peer: FederationPeer = { id, url, lastSeenAt: 0 };
      peers.set(id, peer);
      options.onEvent?.({ kind: 'peer-discovered', peer });
    },
    removePeer(peerId) {
      if (peers.delete(peerId)) {
        options.onEvent?.({ kind: 'peer-lost', peerId });
      }
    },
    peers() {
      // Prune peers we haven't heard from in a long while.
      const now = Date.now();
      for (const peer of [...peers.values()]) {
        if (peer.lastSeenAt > 0 && now - peer.lastSeenAt > STALE_PEER_AFTER_MS) {
          peers.delete(peer.id);
          options.onEvent?.({ kind: 'peer-lost', peerId: peer.id });
        }
      }
      return [...peers.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    },
    publishCatalog(entries) {
      return broadcastSigned({
        kind: 'hub.catalog.delta',
        hubId,
        ts: Date.now(),
        payload: entries,
      });
    },
    publishReceipt(delta) {
      return broadcastSigned({
        kind: 'hub.receipt.delta',
        hubId,
        ts: Date.now(),
        payload: delta,
      });
    },
    async ingest(raw) {
      let signed: SignedMessage;
      try {
        signed = JSON.parse(raw) as SignedMessage;
      } catch {
        options.onEvent?.({ kind: 'message-rejected', reason: 'bad-sig' });
        return;
      }
      const ok = await verify(signed, adminSecret);
      if (!ok) {
        options.onEvent?.({ kind: 'message-rejected', reason: 'bad-sig' });
        return;
      }
      // Stale-drop messages older than 5 minutes.
      if (Date.now() - signed.message.ts > 5 * 60_000) {
        options.onEvent?.({ kind: 'message-rejected', reason: 'stale' });
        return;
      }
      options.onEvent?.({ kind: 'message-in', signed });
      const handlersForKind = handlers.get(signed.message.kind);
      if (handlersForKind) {
        for (const h of handlersForKind) h(signed.message);
      }
      // Forward through gossip so straggler peers converge.
      await gossip.receive(
        {
          id: signed.sig,
          hop: 1,
          originatedAt: signed.message.ts,
          originPeerId: signed.message.hubId,
          payload: signed,
        },
        fanoutPeers(),
      );
    },
    onMessage(kind, handler) {
      let set = handlers.get(kind);
      if (!set) {
        set = new Set();
        handlers.set(kind, set);
      }
      set.add(handler as (m: FederationMessage) => void);
      return () => {
        set!.delete(handler as (m: FederationMessage) => void);
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Default HMAC-SHA-256 sign/verify using Web Crypto (Bun + Node 20+).
// ---------------------------------------------------------------------------

function canonical(message: FederationMessage): string {
  // Stable JSON: keys sorted alphabetically. Plenty fast for our message
  // sizes (catalog deltas are ≤ a few KB).
  return JSON.stringify(message, Object.keys(message).sort());
}

async function defaultSign(message: FederationMessage, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(canonical(message)));
  return bytesToHex(new Uint8Array(sig));
}

async function defaultVerify(signed: SignedMessage, secret: string): Promise<boolean> {
  const expected = await defaultSign(signed.message, secret);
  // Constant-time compare to avoid timing leaks.
  return safeEqualHex(signed.sig, expected);
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Same-LAN discovery — bonjour service browser. Lazy-loaded so test
// suites that disable mDNS don't pay the import cost.
// ---------------------------------------------------------------------------

export interface MdnsBrowser {
  start(onFound: (peer: FederationPeer) => void): void;
  stop(): void;
}

interface BonjourBrowserLike {
  on(event: 'up' | 'down', cb: (service: { name?: string; addresses?: string[]; port?: number; txt?: Record<string, string> }) => void): void;
  start?: () => void;
  stop?: () => void;
}

interface BonjourLike {
  find(opts: { type: string }, onUp?: (service: unknown) => void): BonjourBrowserLike;
  destroy(): void;
}

export async function createMdnsBrowser(): Promise<MdnsBrowser | null> {
  let mod: unknown;
  try {
    mod = await import('bonjour-service');
  } catch {
    return null;
  }
  const Ctor = (mod as { Bonjour?: new () => BonjourLike; default?: new () => BonjourLike }).Bonjour
    ?? (mod as { default?: new () => BonjourLike }).default;
  if (typeof Ctor !== 'function') return null;
  const bonjour = new Ctor();
  let browser: BonjourBrowserLike | null = null;
  return {
    start(onFound) {
      browser = bonjour.find({ type: 'shippie-hub' });
      browser.on('up', (service) => {
        const addr = service.addresses?.[0];
        const port = service.port;
        if (!addr || !port) return;
        const url = `http://${addr}:${port}`;
        onFound({ id: url, url, lastSeenAt: Date.now() });
      });
    },
    stop() {
      try {
        browser?.stop?.();
        bonjour.destroy();
      } catch {
        /* best-effort */
      }
    },
  };
}

export const FEDERATION_HEARTBEAT_INTERVAL_MS = HEARTBEAT_INTERVAL_MS;
export const FEDERATION_STALE_PEER_AFTER_MS = STALE_PEER_AFTER_MS;
