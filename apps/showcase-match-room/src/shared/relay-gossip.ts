import {
  createGossipNode,
  SignalClient,
  type GossipMessage,
  type GossipNode,
  type GossipPeer,
} from '@shippie/proximity';
import { decryptJson, deriveRoomKey, encryptJson } from './crypto.ts';
import { signalUrlFor } from './signal-config.ts';
import type { MatchdayPayload, RoomStatus } from './types.ts';

export interface RelayGossipRoom {
  gossip: GossipNode<MatchdayPayload>;
  peers: () => readonly GossipPeer<MatchdayPayload>[];
  broadcast: (payload: MatchdayPayload) => Promise<boolean>;
  canRelay: () => boolean;
  status: () => RoomStatus;
  subscribe: (handler: (status: RoomStatus) => void) => () => void;
  destroy: () => void;
}

export function createRelayGossipRoom(opts: {
  peerId: string;
  roomId: string;
  roomKey: string;
  signalBase: string;
}): RelayGossipRoom {
  const peers = new Map<string, GossipPeer<MatchdayPayload>>();
  const subscribers = new Set<(status: RoomStatus) => void>();
  const status: RoomStatus = {
    connection: 'connecting',
    peerCount: 0,
    lastActivity: null,
    error: null,
  };
  const gossip = createGossipNode<MatchdayPayload>(opts.peerId, {
    fanout: 6,
    maxHops: 10,
    dedupeWindowMs: 2 * 60_000,
  });

  let key: CryptoKey | null = null;
  let destroyed = false;
  const client = new SignalClient({
    url: signalUrlFor(opts.signalBase, opts.roomId),
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

  const sendToPeer = async (peerId: string, message: GossipMessage<MatchdayPayload>) => {
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
    void decryptJson<GossipMessage<MatchdayPayload>>(key, msg.payload)
      .then((message) => gossip.receive(message, peerList()))
      .then(touch)
      .catch((err) => {
        status.error = err instanceof Error ? err.message : String(err);
        emit();
      });
  });

  void deriveRoomKey(opts.roomKey)
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
