import { describe, expect, test } from 'bun:test';
import { PeerLink } from './webrtc.ts';

// A minimal RTCPeerConnection stub that lets us drive the offer/answer
// + datachannel lifecycle deterministically.
function makeFakePC() {
  type CB<T = unknown> = ((arg: T) => void) | null;
  class FakeChannel {
    readyState: 'connecting' | 'open' | 'closed' = 'connecting';
    onopen: CB = null;
    onclose: CB = null;
    onmessage: CB<{ data: unknown }> = null;
    binaryType = 'arraybuffer';
    sent: unknown[] = [];
    send(d: unknown) {
      this.sent.push(d);
    }
    close() {
      this.readyState = 'closed';
      this.onclose?.(undefined);
    }
    // helper
    open() {
      this.readyState = 'open';
      this.onopen?.(undefined);
    }
    deliver(data: unknown) {
      this.onmessage?.({ data });
    }
  }
  class FakePC {
    static instances: FakePC[] = [];
    onicecandidate: CB<{ candidate: { toJSON(): unknown } | null }> = null;
    onconnectionstatechange: CB = null;
    ondatachannel: CB<{ channel: FakeChannel }> = null;
    connectionState: 'new' | 'connecting' | 'connected' | 'failed' | 'closed' | 'disconnected' = 'new';
    localDescription: { type: string; sdp: string } | null = null;
    remoteDescription: { type: string; sdp: string } | null = null;
    channels: FakeChannel[] = [];
    constructor() {
      FakePC.instances.push(this);
    }
    createDataChannel(_label: string, _opts?: unknown) {
      const ch = new FakeChannel();
      this.channels.push(ch);
      return ch;
    }
    async createOffer() {
      return { type: 'offer' as const, sdp: 'OFFER_SDP' };
    }
    async createAnswer() {
      return { type: 'answer' as const, sdp: 'ANSWER_SDP' };
    }
    async setLocalDescription(d: { type: string; sdp: string }) {
      this.localDescription = d;
    }
    async setRemoteDescription(d: { type: string; sdp: string }) {
      this.remoteDescription = d;
    }
    async addIceCandidate(_c: unknown) {}
    close() {
      this.connectionState = 'closed';
      this.onconnectionstatechange?.(undefined);
    }
    // helper to inject inbound channel for answerers
    receiveChannel() {
      const ch = new FakeChannel();
      this.ondatachannel?.({ channel: ch });
      return ch;
    }
    setConnState(s: typeof FakePC.prototype.connectionState) {
      this.connectionState = s;
      this.onconnectionstatechange?.(undefined);
    }
  }
  return { FakePC, FakeChannel };
}

describe('PeerLink', () => {
  test('initiator: createOffer → sendSignal(offer)', async () => {
    const { FakePC } = makeFakePC();
    const sent: { kind: string; sdp?: string }[] = [];
    const link = new PeerLink({
      selfId: 'a',
      peerId: 'b',
      initiator: true,
      sendSignal: (m) => sent.push(m as { kind: string; sdp?: string }),
      RTCPeerConnection: FakePC as unknown as typeof RTCPeerConnection,
    });
    await link.start();
    expect(sent.find((s) => s.kind === 'offer')).toBeDefined();
    expect(link.state).toBe('connecting');
  });

  test('answerer: handleSignal(offer) → sendSignal(answer)', async () => {
    const { FakePC } = makeFakePC();
    const sent: { kind: string }[] = [];
    const link = new PeerLink({
      selfId: 'b',
      peerId: 'a',
      initiator: false,
      sendSignal: (m) => sent.push(m),
      RTCPeerConnection: FakePC as unknown as typeof RTCPeerConnection,
    });
    await link.handleSignal({ kind: 'offer', sdp: 'X' });
    expect(sent.find((s) => s.kind === 'answer')).toBeDefined();
  });

  test('datachannel open fires onOpen and state=open', async () => {
    const { FakePC } = makeFakePC();
    const link = new PeerLink({
      selfId: 'a',
      peerId: 'b',
      initiator: true,
      sendSignal: () => {},
      RTCPeerConnection: FakePC as unknown as typeof RTCPeerConnection,
    });
    let opened = false;
    link.onOpen(() => {
      opened = true;
    });
    const pc = (FakePC as unknown as { instances: { channels: { open(): void }[] }[] }).instances[0]!;
    pc.channels[0]!.open();
    expect(opened).toBe(true);
    expect(link.state).toBe('open');
  });

  test('send/receive round-trip via channel', () => {
    const { FakePC } = makeFakePC();
    const link = new PeerLink({
      selfId: 'a',
      peerId: 'b',
      initiator: true,
      sendSignal: () => {},
      RTCPeerConnection: FakePC as unknown as typeof RTCPeerConnection,
    });
    const pc = (FakePC as unknown as { instances: { channels: { open(): void; sent: unknown[]; deliver(x: unknown): void }[] }[] }).instances[0]!;
    pc.channels[0]!.open();

    const got: unknown[] = [];
    link.onMessage((m) => got.push(m));
    link.send('hello');
    expect(pc.channels[0]!.sent).toEqual(['hello']);

    pc.channels[0]!.deliver('world');
    expect(got).toEqual(['world']);
  });

  test('connectionstatechange propagates failed state', () => {
    const { FakePC } = makeFakePC();
    const link = new PeerLink({
      selfId: 'a',
      peerId: 'b',
      initiator: true,
      sendSignal: () => {},
      RTCPeerConnection: FakePC as unknown as typeof RTCPeerConnection,
    });
    const pc = (FakePC as unknown as { instances: { setConnState(s: string): void }[] }).instances[0]!;
    const states: string[] = [];
    link.onStateChange((s) => states.push(s));
    pc.setConnState('failed');
    expect(states).toContain('failed');
    expect(link.state).toBe('failed');
  });
});
