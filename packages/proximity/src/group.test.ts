/**
 * Group is the integration glue across signal/webrtc/handshake/eventlog/
 * crdt. The fine-grained behavior of each is covered by its own test.
 * Here we just sanity-check the factory + room-id wiring.
 */
import { describe, expect, test } from 'bun:test';
import { createGroup, joinGroup } from './group.ts';

class StubWS {
  static instances: StubWS[] = [];
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  sent: string[] = [];
  constructor(url: string) {
    this.url = url;
    StubWS.instances.push(this);
  }
  send(d: string) {
    if (this.readyState !== 1) throw new Error('not open');
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
  }
}

class StubRTC {
  static instances: StubRTC[] = [];
  onicecandidate: ((e: unknown) => void) | null = null;
  ondatachannel: ((e: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState = 'new';
  constructor() {
    StubRTC.instances.push(this);
  }
  createDataChannel() {
    return { send() {}, close() {}, readyState: 'connecting', onopen: null, onclose: null, onmessage: null };
  }
  async createOffer() { return { sdp: '', type: 'offer' }; }
  async createAnswer() { return { sdp: '', type: 'answer' }; }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  async addIceCandidate() {}
  close() {}
}

describe('group factory', () => {
  test('createGroup mints a joinCode + roomId, stays uppercased', async () => {
    const originalWS = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    const originalRTC = (globalThis as { RTCPeerConnection?: typeof RTCPeerConnection }).RTCPeerConnection;
    (globalThis as { WebSocket?: unknown }).WebSocket = StubWS;
    (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = StubRTC;
    try {
      const g = await createGroup({
        appSlug: 'whiteboard',
        signalUrlBase: 'wss://app.shippie.app/__shippie/signal',
      });
      expect(g.joinCode).toMatch(/^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{8}$/);
      expect(g.roomId).toMatch(/^[0-9a-f]{64}$/);
      expect(g.selfId).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
      g.leave();
    } finally {
      (globalThis as { WebSocket?: unknown }).WebSocket = originalWS;
      (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = originalRTC;
    }
  });

  test('joinGroup respects the supplied join code', async () => {
    const originalWS = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    const originalRTC = (globalThis as { RTCPeerConnection?: typeof RTCPeerConnection }).RTCPeerConnection;
    (globalThis as { WebSocket?: unknown }).WebSocket = StubWS;
    (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = StubRTC;
    try {
      const g = await joinGroup({
        appSlug: 'whiteboard',
        joinCode: 'abcdefgh',
        signalUrlBase: 'wss://app.shippie.app/__shippie/signal',
      });
      expect(g.joinCode).toBe('ABCDEFGH');
      g.leave();
    } finally {
      (globalThis as { WebSocket?: unknown }).WebSocket = originalWS;
      (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = originalRTC;
    }
  });

  test('sharedState returns the same instance per name', async () => {
    const originalWS = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    const originalRTC = (globalThis as { RTCPeerConnection?: typeof RTCPeerConnection }).RTCPeerConnection;
    (globalThis as { WebSocket?: unknown }).WebSocket = StubWS;
    (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = StubRTC;
    try {
      const g = await createGroup({ appSlug: 'whiteboard' });
      const a = g.sharedState('strokes');
      const b = g.sharedState('strokes');
      expect(a).toBe(b);
      g.leave();
    } finally {
      (globalThis as { WebSocket?: unknown }).WebSocket = originalWS;
      (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = originalRTC;
    }
  });
});
