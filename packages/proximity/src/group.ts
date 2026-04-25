/**
 * Group lifecycle: create / join / broadcast / send / on, plus
 * sharedState() and eventLog() factories.
 *
 * Wires together: SignalClient (rendezvous) → PeerLink (WebRTC P2P) →
 * X25519 handshake → AES-GCM/Ed25519 envelopes → Yjs sharedState +
 * EventLog primitives.
 *
 * The DO never sees keys or payloads — it only fans out signal frames.
 */
import { SignalClient, buildSignalUrl } from './client.ts';
import { SharedState } from './crdt.ts';
import {
  decryptEnvelope,
  encryptEnvelope,
  generateSigningKeyPair,
  importPeerSigningKey,
  type SigningKeyPair,
} from './encryption.ts';
import { EventLog } from './eventlog.ts';
import {
  deriveHandshakeSalt,
  deriveSharedAesKey,
  generateEphemeralKeyPair,
  importPeerPublicKey,
  type HandshakeKeyPair,
} from './handshake.ts';
import { deriveRoomId, generateJoinCode } from './room-id.ts';
import { discoverPublicIp } from './stun.ts';
import { PeerLink, type PeerSignal } from './webrtc.ts';
import type {
  CreateGroupOptions,
  EncryptedEnvelope,
  EventHandler,
  JoinCode,
  JoinGroupOptions,
  LogEntry,
  PeerId,
  RoomId,
} from './types.ts';

export interface GroupState {
  readonly joinCode: JoinCode;
  readonly roomId: RoomId;
  readonly selfId: PeerId;
  /** Live members (excluding self). */
  members(): PeerId[];
}

export interface Group extends GroupState {
  /** Send to everyone on a named channel. */
  broadcast(channel: string, data: unknown): Promise<void>;
  /** Send to a single peer. */
  send(peerId: PeerId, channel: string, data: unknown): Promise<void>;
  /** Subscribe to a named channel. */
  on(channel: string, handler: EventHandler): () => void;
  /** Y.Doc-backed shared state. */
  sharedState(name: string): SharedState;
  /** Append-only log primitive. */
  eventLog<T>(name: string): EventLog<T>;
  /** Tear down everything. */
  leave(): void;
}

interface PeerEntry {
  link: PeerLink;
  /** ed25519 long-term peer id, populated after handshake. */
  signingPeerId: PeerId | null;
  ephemeral: HandshakeKeyPair | null;
  aesKey: CryptoKey | null;
  ready: Promise<void>;
}

const HANDSHAKE_TYPE = '__shippie_hs__';

export async function createGroup(opts: CreateGroupOptions): Promise<Group> {
  const joinCode = (opts.joinCode ?? generateJoinCode()).toUpperCase();
  return openGroup({ ...opts, joinCode });
}

export async function joinGroup(opts: JoinGroupOptions): Promise<Group> {
  return openGroup({ ...opts, joinCode: opts.joinCode.toUpperCase() });
}

interface OpenGroupOptions extends Omit<CreateGroupOptions, 'joinCode'> {
  joinCode: JoinCode;
}

async function openGroup(opts: OpenGroupOptions): Promise<Group> {
  const publicIp = (await discoverPublicIp({ iceServers: opts.iceServers }).catch(() => null)) ?? '0.0.0.0';
  const roomId = await deriveRoomId(publicIp, opts.appSlug, opts.joinCode);
  const signingKeys = await generateSigningKeyPair();
  const selfId = signingKeys.peerId;

  const signalUrl = buildSignalUrl(opts.signalUrlBase ?? '/__shippie/signal', roomId);
  const signal = new SignalClient({ url: signalUrl });

  const peers = new Map<PeerId, PeerEntry>();
  const sharedStates = new Map<string, SharedState>();
  const eventLogs = new Map<string, EventLog<unknown>>();
  const channelHandlers = new Map<string, Set<EventHandler>>();

  // ----- helpers ----------------------------------------------------

  function getOrCreateChannelSet(channel: string): Set<EventHandler> {
    let s = channelHandlers.get(channel);
    if (!s) {
      s = new Set();
      channelHandlers.set(channel, s);
    }
    return s;
  }

  function dispatch(channel: string, data: unknown, from: PeerId) {
    const set = channelHandlers.get(channel);
    if (set) for (const h of set) h(data, from);

    // Internal: Yjs update broadcasting.
    if (channel.startsWith('crdt:')) {
      const name = channel.slice('crdt:'.length);
      const state = sharedStates.get(name);
      if (state && data instanceof Uint8Array) state.applyUpdate(data);
      else if (state && data && typeof data === 'object' && 'b64' in (data as Record<string, unknown>)) {
        const b64 = (data as { b64: string }).b64;
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        state.applyUpdate(bytes);
      }
    }
    if (channel.startsWith('log:')) {
      const name = channel.slice('log:'.length);
      const log = eventLogs.get(name);
      if (log && data && typeof data === 'object') log.apply(data as LogEntry);
    }
  }

  async function handleEnvelope(env: EncryptedEnvelope, peer: PeerEntry) {
    if (!peer.aesKey) return;
    try {
      const payload = await decryptEnvelope({
        aesKey: peer.aesKey,
        envelope: env,
        resolveVerifier: (id) => importPeerSigningKey(id),
      });
      dispatch(env.channel, payload, env.from);
    } catch (err) {
      // Drop on verify/decrypt failure. Don't break the link — a single
      // tampered packet shouldn't tear down the whole group.
      console.warn('proximity: envelope rejected', (err as Error).message);
    }
  }

  // Set up a peer link with ephemeral key exchange.
  function attachLink(peerSignalId: PeerId, link: PeerLink, isInitiator: boolean): PeerEntry {
    const ephemeral: HandshakeKeyPair | null = null;
    let resolveReady: () => void;
    const ready = new Promise<void>((r) => {
      resolveReady = r;
    });
    const entry: PeerEntry = {
      link,
      signingPeerId: null,
      ephemeral,
      aesKey: null,
      ready,
    };

    link.onMessage(async (data) => {
      const text = typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== 'object') return;
      const msg = parsed as Record<string, unknown>;
      if (msg.t === HANDSHAKE_TYPE) {
        // Their ephemeral pubkey + their long-term peerId.
        const algo = msg.algo as 'X25519' | 'P-256';
        const pubB64 = msg.pub as string;
        const longId = msg.peerId as string;
        const pubBytes = Uint8Array.from(atob(pubB64), (c) => c.charCodeAt(0));
        const peerPub = await importPeerPublicKey(algo, pubBytes);

        // Make sure we've sent ours too. If we haven't (we're the
        // answerer who didn't send first), send now.
        if (!entry.ephemeral) {
          entry.ephemeral = await generateEphemeralKeyPair();
          sendHandshake(entry, signingKeys);
        }
        entry.signingPeerId = longId;
        const salt = await deriveHandshakeSalt(selfId, longId);
        const result = await deriveSharedAesKey(entry.ephemeral!, peerPub, salt);
        entry.aesKey = result.aesKey;
        resolveReady();
        return;
      }
      // Otherwise, an encrypted envelope.
      await handleEnvelope(parsed as EncryptedEnvelope, entry);
    });

    link.onOpen(async () => {
      // Initiator sends ephemeral pubkey first.
      if (!entry.ephemeral) entry.ephemeral = await generateEphemeralKeyPair();
      if (isInitiator) sendHandshake(entry, signingKeys);
    });

    link.onClose(() => {
      peers.delete(peerSignalId);
    });

    return entry;
  }

  function sendHandshake(entry: PeerEntry, signing: SigningKeyPair) {
    if (!entry.ephemeral) return;
    const pubB64 = bytesToBase64(entry.ephemeral.publicKeyBytes);
    try {
      entry.link.send(
        JSON.stringify({
          t: HANDSHAKE_TYPE,
          algo: entry.ephemeral.algorithm,
          pub: pubB64,
          peerId: signing.peerId,
        }),
      );
    } catch {
      // Channel might not be open yet — onOpen will retry.
    }
  }

  // ----- signalling wiring -----------------------------------------

  signal.onOpen(() => {
    signal.send({ t: 'hello', peerId: selfId });
  });

  signal.on('peer-joined', (msg) => {
    if (msg.peerId === selfId) return;
    if (peers.has(msg.peerId)) return;
    // We initiate to peers that joined after us — but we use peerId
    // ordering instead of who-saw-whom-first to decide deterministically
    // and avoid double offers.
    const initiator = selfId < msg.peerId;
    const link = new PeerLink({
      selfId,
      peerId: msg.peerId,
      initiator,
      iceServers: opts.iceServers,
      sendSignal: (s) => relaySignal(msg.peerId, s),
    });
    peers.set(msg.peerId, attachLink(msg.peerId, link, initiator));
    if (initiator) void link.start();
  });

  signal.on('peer-left', (msg) => {
    const entry = peers.get(msg.peerId);
    if (entry) {
      entry.link.close();
      peers.delete(msg.peerId);
    }
  });

  signal.on('offer', async (msg) => {
    if (msg.to !== selfId) return;
    let entry = peers.get(msg.from);
    if (!entry) {
      const link = new PeerLink({
        selfId,
        peerId: msg.from,
        initiator: false,
        iceServers: opts.iceServers,
        sendSignal: (s) => relaySignal(msg.from, s),
      });
      entry = attachLink(msg.from, link, false);
      peers.set(msg.from, entry);
    }
    await entry.link.handleSignal({ kind: 'offer', sdp: msg.sdp });
  });

  signal.on('answer', async (msg) => {
    if (msg.to !== selfId) return;
    const entry = peers.get(msg.from);
    if (!entry) return;
    await entry.link.handleSignal({ kind: 'answer', sdp: msg.sdp });
  });

  signal.on('ice', async (msg) => {
    if (msg.to !== selfId) return;
    const entry = peers.get(msg.from);
    if (!entry) return;
    await entry.link.handleSignal({ kind: 'ice', candidate: msg.candidate });
  });

  function relaySignal(to: PeerId, s: PeerSignal) {
    if (s.kind === 'offer') signal.send({ t: 'offer', from: selfId, to, sdp: s.sdp });
    else if (s.kind === 'answer') signal.send({ t: 'answer', from: selfId, to, sdp: s.sdp });
    else if (s.kind === 'ice') signal.send({ t: 'ice', from: selfId, to, candidate: s.candidate });
  }

  signal.connect();

  // ----- public group API ------------------------------------------

  async function broadcast(channel: string, data: unknown) {
    const sends: Promise<unknown>[] = [];
    for (const peer of peers.values()) {
      sends.push(sendToPeer(peer, channel, data));
    }
    await Promise.allSettled(sends);
  }

  async function send(peerId: PeerId, channel: string, data: unknown) {
    for (const peer of peers.values()) {
      if (peer.signingPeerId === peerId) {
        await sendToPeer(peer, channel, data);
        return;
      }
    }
    throw new Error(`group.send: peer ${peerId} not connected`);
  }

  async function sendToPeer(peer: PeerEntry, channel: string, data: unknown) {
    await peer.ready;
    if (!peer.aesKey) return;
    const env = await encryptEnvelope({
      aesKey: peer.aesKey,
      signing: signingKeys,
      channel,
      payload: data,
    });
    try {
      peer.link.send(JSON.stringify(env));
    } catch {
      // Channel might have closed mid-send; the close handler removes the peer.
    }
  }

  function on(channel: string, handler: EventHandler): () => void {
    const set = getOrCreateChannelSet(channel);
    set.add(handler);
    return () => set.delete(handler);
  }

  function sharedState(name: string): SharedState {
    let s = sharedStates.get(name);
    if (!s) {
      s = new SharedState({ name });
      const channel = `crdt:${name}`;
      // Pipe local Yjs updates out to every peer.
      s.onLocalUpdate((update) => {
        const b64 = bytesToBase64(update);
        void broadcast(channel, { b64 });
      });
      sharedStates.set(name, s);
    }
    return s;
  }

  function eventLog<T>(name: string): EventLog<T> {
    let log = eventLogs.get(name);
    if (!log) {
      const l = new EventLog<T>({ selfId });
      const channel = `log:${name}`;
      l.onEntry((entry) => {
        // Only broadcast our own appends — applied-from-peer entries
        // came in already.
        if (entry.author === selfId) void broadcast(channel, entry);
      });
      log = l as unknown as EventLog<unknown>;
      eventLogs.set(name, log);
    }
    return log as unknown as EventLog<T>;
  }

  function leave() {
    for (const peer of peers.values()) peer.link.close();
    peers.clear();
    for (const s of sharedStates.values()) s.destroy();
    sharedStates.clear();
    eventLogs.clear();
    signal.close();
  }

  function members(): PeerId[] {
    return [...peers.values()]
      .map((p) => p.signingPeerId)
      .filter((id): id is PeerId => id !== null);
  }

  return {
    joinCode: opts.joinCode,
    roomId,
    selfId,
    members,
    broadcast,
    send,
    on,
    sharedState,
    eventLog,
    leave,
  };
}

function bytesToBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
  return btoa(s);
}
