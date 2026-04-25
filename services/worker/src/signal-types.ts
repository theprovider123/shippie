/**
 * Wire types for the Proximity Protocol signalling channel.
 *
 * Mirrors `packages/proximity/src/types.ts` so client + DO talk the
 * same JSON. We re-declare instead of importing to keep the worker
 * free of `@shippie/proximity` (which pulls in browser-only deps).
 */
export type PeerId = string;

export interface SignalHello {
  t: 'hello';
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
  candidate: unknown;
}

export type SignalMessage =
  | SignalHello
  | SignalPeerJoined
  | SignalPeerLeft
  | SignalOffer
  | SignalAnswer
  | SignalIce;
