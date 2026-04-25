/**
 * RTCPeerConnection wrapper.
 *
 * One `PeerLink` instance per remote peer. Wraps:
 *   - createOffer / setRemote / createAnswer dance
 *   - ICE candidate exchange via the SignalClient
 *   - datachannel `shippie-mesh` with retry + reopen
 *   - simple JSON wire protocol on top of the datachannel
 *
 * The signal layer feeds it offers/answers/ice; the link returns the
 * raw datachannel for the encryption layer to wrap.
 *
 * Reliability:
 *   - Datachannel `ordered: true, negotiated: false`. We let the WebRTC
 *     stack pick a stream id.
 *   - On unexpected close we report the link dead — the group layer
 *     decides whether to retry (creating a fresh link).
 *   - Optional TURN servers come in via `iceServers`. The Cloudflare
 *     Calls TURN endpoint is the production fallback (env-driven).
 */
import type { PeerId } from './types.ts';

export interface PeerLinkOptions {
  selfId: PeerId;
  peerId: PeerId;
  iceServers?: RTCIceServer[];
  /** Whether we're the offerer (vs answerer). */
  initiator: boolean;
  /** RTCPeerConnection ctor (override for tests). */
  RTCPeerConnection?: typeof RTCPeerConnection;
  /** Send a signal frame to the peer (offer / answer / ice). */
  sendSignal: (msg: PeerSignal) => void;
}

export type PeerSignal =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: RTCIceCandidateInit };

export type PeerLinkState =
  | 'new'
  | 'connecting'
  | 'open'
  | 'closed'
  | 'failed';

export class PeerLink {
  readonly selfId: PeerId;
  readonly peerId: PeerId;
  readonly initiator: boolean;
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private _state: PeerLinkState = 'new';

  private msgHandlers = new Set<(data: ArrayBuffer | string) => void>();
  private openHandlers = new Set<() => void>();
  private closeHandlers = new Set<() => void>();
  private stateHandlers = new Set<(s: PeerLinkState) => void>();

  constructor(private opts: PeerLinkOptions) {
    this.selfId = opts.selfId;
    this.peerId = opts.peerId;
    this.initiator = opts.initiator;

    const Ctor =
      opts.RTCPeerConnection ??
      (globalThis as { RTCPeerConnection?: typeof RTCPeerConnection }).RTCPeerConnection;
    if (!Ctor) throw new Error('PeerLink: RTCPeerConnection unavailable');
    this.pc = new Ctor({ iceServers: opts.iceServers ?? [] });

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        opts.sendSignal({ kind: 'ice', candidate: e.candidate.toJSON() });
      }
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'connected') this.setState('open');
      else if (s === 'failed') this.setState('failed');
      else if (s === 'closed' || s === 'disconnected') this.setState('closed');
      else if (s === 'connecting') this.setState('connecting');
    };

    if (this.initiator) {
      // Offerer creates the channel.
      this.attachChannel(this.pc.createDataChannel('shippie-mesh', { ordered: true }));
    } else {
      // Answerer receives the channel.
      this.pc.ondatachannel = (e) => this.attachChannel(e.channel);
    }
  }

  /** Begin offerer flow. Idempotent — only meaningful for `initiator=true`. */
  async start(): Promise<void> {
    if (!this.initiator) return;
    this.setState('connecting');
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.opts.sendSignal({ kind: 'offer', sdp: offer.sdp ?? '' });
  }

  /** Plug in a signal frame received from the peer. */
  async handleSignal(msg: PeerSignal): Promise<void> {
    if (msg.kind === 'offer') {
      if (this.initiator) return; // shouldn't get an offer if we're the offerer
      this.setState('connecting');
      await this.pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.opts.sendSignal({ kind: 'answer', sdp: answer.sdp ?? '' });
    } else if (msg.kind === 'answer') {
      if (!this.initiator) return;
      await this.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
    } else if (msg.kind === 'ice') {
      try {
        await this.pc.addIceCandidate(msg.candidate);
      } catch {
        // ICE arriving before remote-description is normal during the
        // handshake; the WebRTC stack queues internally. Other failure
        // modes are noisy but non-fatal.
      }
    }
  }

  send(data: string | ArrayBuffer | ArrayBufferView): void {
    if (!this.channel || this.channel.readyState !== 'open') {
      throw new Error(`PeerLink: channel not open (${this.channel?.readyState ?? 'none'})`);
    }
    if (typeof data === 'string') this.channel.send(data);
    else if (data instanceof ArrayBuffer) this.channel.send(data);
    else this.channel.send(data as unknown as ArrayBuffer);
  }

  onMessage(fn: (data: ArrayBuffer | string) => void): () => void {
    this.msgHandlers.add(fn);
    return () => this.msgHandlers.delete(fn);
  }
  onOpen(fn: () => void): () => void {
    this.openHandlers.add(fn);
    return () => this.openHandlers.delete(fn);
  }
  onClose(fn: () => void): () => void {
    this.closeHandlers.add(fn);
    return () => this.closeHandlers.delete(fn);
  }
  onStateChange(fn: (s: PeerLinkState) => void): () => void {
    this.stateHandlers.add(fn);
    return () => this.stateHandlers.delete(fn);
  }

  get state(): PeerLinkState {
    return this._state;
  }

  close(): void {
    this.setState('closed');
    try {
      this.channel?.close();
    } catch {
      // ignore
    }
    try {
      this.pc.close();
    } catch {
      // ignore
    }
  }

  private attachChannel(channel: RTCDataChannel) {
    this.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      this.setState('open');
      for (const fn of this.openHandlers) fn();
    };
    channel.onclose = () => {
      this.setState('closed');
      for (const fn of this.closeHandlers) fn();
    };
    channel.onmessage = (e) => {
      for (const fn of this.msgHandlers) fn(e.data as ArrayBuffer | string);
    };
  }

  private setState(s: PeerLinkState) {
    if (this._state === s) return;
    this._state = s;
    for (const fn of this.stateHandlers) fn(s);
  }
}
