import {
  createGossipNode,
  SignalClient,
  type GossipMessage,
  type GossipPeer,
} from '@shippie/proximity';
import { decryptJson, deriveSpaceKey, encryptJson } from './crypto.ts';
import type { EncryptedGossipRoom, SpaceRoomStatus } from './types.ts';

export function signalUrlFor(signalBase: string, spaceId: string): string {
  if (signalBase.includes('{space}')) {
    const resolved = signalBase.replace('{space}', encodeURIComponent(spaceId));
    return resolved.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  }
  if (signalBase.includes('{room}')) {
    const resolved = signalBase.replace('{room}', encodeURIComponent(spaceId));
    return resolved.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  }
  const base = signalBase.replace(/\/$/, '');
  return `${base}/${encodeURIComponent(spaceId)}`.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
}

export function defaultSignalBaseForRuntime(path = '/__shippie/signal'): string {
  if (typeof location === 'undefined') return `https://shippie.app${path}`;
  return `${location.protocol}//${location.host}${path}`;
}

export function createEncryptedGossipRoom<TPayload>(opts: {
  peerId: string;
  spaceId: string;
  secret: string;
  signalBase: string;
  keySalt?: string;
  fanout?: number;
  maxHops?: number;
  dedupeWindowMs?: number;
}): EncryptedGossipRoom<TPayload> {
  const peers = new Map<string, GossipPeer<TPayload>>();
  const subscribers = new Set<(status: SpaceRoomStatus) => void>();
  const status: SpaceRoomStatus = {
    connection: 'connecting',
    peerCount: 0,
    lastActivity: null,
    error: null,
  };
  const gossip = createGossipNode<TPayload>(opts.peerId, {
    fanout: opts.fanout ?? 6,
    maxHops: opts.maxHops ?? 10,
    dedupeWindowMs: opts.dedupeWindowMs ?? 2 * 60_000,
  });

  let key: CryptoKey | null = null;
  let destroyed = false;
  const client = new SignalClient({
    url: signalUrlFor(opts.signalBase, opts.spaceId),
  });

  const peerList = () => [...peers.values()];

  const emit = () => {
    status.peerCount = peers.size;
    const snapshot = { ...status };
    for (const fn of subscribers) fn(snapshot);
  };

  const touch = () => {
    status.lastActivity = Date.now();
    emit();
  };

  const sendToPeer = async (peerId: string, message: GossipMessage<TPayload>) => {
    if (!key || client.readyState !== WebSocket.OPEN) throw new Error('relay unavailable');
    const payload = await encryptJson(key, message);
    client.send({ t: 'relay', to: peerId, payload });
    touch();
  };

  const ensurePeer = (peerId: string) => {
    if (peerId === opts.peerId || peers.has(peerId)) return;
    peers.set(peerId, {
      id: peerId,
      send: (message) => sendToPeer(peerId, message),
    });
    emit();
  };

  client.onOpen(() => {
    status.connection = 'open';
    status.error = null;
    emit();
    client.send({ t: 'hello', peerId: opts.peerId });
    touch();
  });
  client.onClose(() => {
    status.connection = destroyed ? 'closed' : 'connecting';
    peers.clear();
    emit();
  });
  client.onError((err) => {
    status.error = err.message;
    emit();
  });
  client.on('peer-joined', (msg) => {
    ensurePeer(msg.peerId);
  });
  client.on('peer-left', (msg) => {
    peers.delete(msg.peerId);
    emit();
  });
  client.on('relay', (msg) => {
    if (!key || typeof msg.payload !== 'string') return;
    if (msg.from) ensurePeer(msg.from);
    void decryptJson<GossipMessage<TPayload>>(key, msg.payload)
      .then((message) => gossip.receive(message, peerList()))
      .then(touch)
      .catch((err) => {
        status.error = err instanceof Error ? err.message : String(err);
        emit();
      });
  });

  void deriveSpaceKey(opts.secret, { salt: opts.keySalt })
    .then((derived) => {
      key = derived;
      if (!destroyed) client.connect();
    })
    .catch((err) => {
      status.connection = 'closed';
      status.error = err instanceof Error ? err.message : String(err);
      emit();
    });

  return {
    gossip,
    peers: peerList,
    async broadcast(payload) {
      await gossip.broadcast(payload, peerList());
      return client.readyState === WebSocket.OPEN && peers.size > 0;
    },
    canRelay() {
      return client.readyState === WebSocket.OPEN && peers.size > 0 && !!key;
    },
    status() {
      return { ...status };
    },
    subscribe(handler) {
      subscribers.add(handler);
      handler({ ...status });
      return () => subscribers.delete(handler);
    },
    destroy() {
      destroyed = true;
      status.connection = 'closed';
      peers.clear();
      client.close();
      emit();
      subscribers.clear();
    },
  };
}

