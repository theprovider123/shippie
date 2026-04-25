/**
 * Shared types for the Shippie Proximity Protocol.
 *
 * Wire envelopes between peers and between client/signal-DO.
 */

/** Identity of a peer in a room. ed25519 long-term key, base64url. */
export type PeerId = string;

/** Rendezvous code (8-char base32). */
export type JoinCode = string;

/** SHA-256(public_ip + app_slug + group_code), hex. 64 chars. */
export type RoomId = string;

// ---------------------------------------------------------------------
// Signalling (WebSocket ↔ SignalRoom DO)
// ---------------------------------------------------------------------

export interface SignalHello {
  t: 'hello';
  /** This peer's ephemeral signalling id (random, per-session). */
  peerId: PeerId;
}

export interface SignalPeerJoined {
  t: 'peer-joined';
  peerId: PeerId;
}

export interface SignalPeerLeft {
  t: 'peer-left';
  peerId: PeerId;
}

export interface SignalOffer {
  t: 'offer';
  from: PeerId;
  to: PeerId;
  sdp: string;
}

export interface SignalAnswer {
  t: 'answer';
  from: PeerId;
  to: PeerId;
  sdp: string;
}

export interface SignalIce {
  t: 'ice';
  from: PeerId;
  to: PeerId;
  candidate: RTCIceCandidateInit;
}

export type SignalMessage =
  | SignalHello
  | SignalPeerJoined
  | SignalPeerLeft
  | SignalOffer
  | SignalAnswer
  | SignalIce;

// ---------------------------------------------------------------------
// Group SDK shape
// ---------------------------------------------------------------------

export interface CreateGroupOptions {
  /** App slug used in the room id formula. */
  appSlug: string;
  /** Optional human-friendly name (just metadata). */
  name?: string;
  /** Override the auto-generated 8-char join code. */
  joinCode?: JoinCode;
  /** STUN/TURN servers — defaults to public STUN. */
  iceServers?: RTCIceServer[];
  /** Override worker signal endpoint base (default `/__shippie/signal`). */
  signalUrlBase?: string;
}

export interface JoinGroupOptions extends Omit<CreateGroupOptions, 'name' | 'joinCode'> {
  joinCode: JoinCode;
}

export type EventHandler<T = unknown> = (data: T, peerId: PeerId) => void;

// ---------------------------------------------------------------------
// Encryption envelope
// ---------------------------------------------------------------------

export interface EncryptedEnvelope {
  /** AES-GCM ciphertext, base64. */
  c: string;
  /** 12-byte IV, base64. */
  iv: string;
  /** ed25519 signature over (iv || c), base64. */
  sig: string;
  /** Sender peer id (ed25519 pubkey, base64url). */
  from: PeerId;
  /** App-level type tag (e.g. 'chan:cursor', 'evt:chat'). */
  channel: string;
}

// ---------------------------------------------------------------------
// EventLog
// ---------------------------------------------------------------------

export type VectorClock = Record<PeerId, number>;

export interface LogEntry<T = unknown> {
  /** Globally unique id. */
  id: string;
  author: PeerId;
  /** Timestamp at author. ms since epoch. */
  ts: number;
  /** Vector clock snapshot at author. */
  clock: VectorClock;
  /** Last-write-wins key (optional). */
  key?: string;
  data: T;
}
