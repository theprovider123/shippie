import { describe, expect, test } from 'bun:test';
import { buildSignalUrl, SignalClient } from './client.ts';
import type { SignalMessage } from './types.ts';

class FakeWS {
  static instances: FakeWS[] = [];
  url: string;
  readyState = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  sent: string[] = [];
  constructor(url: string) {
    this.url = url;
    FakeWS.instances.push(this);
  }
  send(data: string) {
    if (this.readyState !== 1) throw new Error('not open');
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    queueMicrotask(() => this.onclose?.());
  }
  // helpers for tests
  open() {
    this.readyState = 1;
    queueMicrotask(() => this.onopen?.());
  }
  message(payload: SignalMessage) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

describe('SignalClient', () => {
  test('connect → open → typed dispatch', async () => {
    FakeWS.instances.length = 0;
    const client = new SignalClient({
      url: 'wss://app.shippie.app/__shippie/signal/abc',
      WebSocket: FakeWS as unknown as typeof WebSocket,
      noReconnect: true,
    });
    let opened = false;
    client.onOpen(() => {
      opened = true;
    });
    const offers: SignalMessage[] = [];
    client.on('offer', (m) => offers.push(m));

    client.connect();
    const ws = FakeWS.instances[0]!;
    ws.open();
    await new Promise((r) => setTimeout(r, 0));
    expect(opened).toBe(true);

    ws.message({ t: 'offer', from: 'p1', to: 'p2', sdp: 'v=0' });
    expect(offers).toHaveLength(1);
    expect(offers[0]).toEqual({ t: 'offer', from: 'p1', to: 'p2', sdp: 'v=0' });
  });

  test('send writes JSON', () => {
    FakeWS.instances.length = 0;
    const client = new SignalClient({
      url: 'wss://x',
      WebSocket: FakeWS as unknown as typeof WebSocket,
      noReconnect: true,
    });
    client.connect();
    const ws = FakeWS.instances[0]!;
    ws.readyState = 1;
    client.send({ t: 'hello', peerId: 'p1' });
    expect(JSON.parse(ws.sent[0]!)).toEqual({ t: 'hello', peerId: 'p1' });
  });

  test('reconnects on close with backoff (when allowed)', async () => {
    FakeWS.instances.length = 0;
    const client = new SignalClient({
      url: 'wss://x',
      WebSocket: FakeWS as unknown as typeof WebSocket,
      baseBackoffMs: 5,
      maxBackoffMs: 5,
    });
    client.connect();
    const first = FakeWS.instances[0]!;
    first.readyState = 3;
    first.onclose?.();
    await new Promise((r) => setTimeout(r, 30));
    expect(FakeWS.instances.length).toBeGreaterThanOrEqual(2);
    client.close();
  });

  test('close is permanent', async () => {
    FakeWS.instances.length = 0;
    const client = new SignalClient({
      url: 'wss://x',
      WebSocket: FakeWS as unknown as typeof WebSocket,
      baseBackoffMs: 5,
    });
    client.connect();
    client.close();
    const first = FakeWS.instances[0]!;
    first.onclose?.();
    await new Promise((r) => setTimeout(r, 30));
    expect(FakeWS.instances.length).toBe(1);
  });
});

describe('buildSignalUrl', () => {
  test('appends roomId to relative base', () => {
    const url = buildSignalUrl('/__shippie/signal', 'abcdef');
    // Resolves against https://shippie.app default in non-browser tests.
    expect(url).toMatch(/wss:\/\/shippie\.app\/__shippie\/signal\/abcdef$/);
  });

  test('upgrades https → wss', () => {
    const url = buildSignalUrl('https://app.example.com/__shippie/signal', 'r1');
    expect(url).toBe('wss://app.example.com/__shippie/signal/r1');
  });

  test('preserves wss', () => {
    const url = buildSignalUrl('wss://x.example.com/__shippie/signal/', 'r1');
    expect(url).toBe('wss://x.example.com/__shippie/signal/r1');
  });
});
