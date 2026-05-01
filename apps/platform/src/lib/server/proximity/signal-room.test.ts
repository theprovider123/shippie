/**
 * SignalRoom Durable Object — message routing tests.
 *
 * The DO uses Cloudflare-runtime APIs (`WebSocketPair`, `server.accept()`,
 * `Response({ webSocket })`). Vitest doesn't ship those, so we install a
 * minimal `WebSocketPair` shim that records dispatched messages and lets
 * us drive `message` / `close` events. Then we exercise the DO end to
 * end against the same `SignalMessage` shapes the proximity client speaks.
 *
 * What's covered:
 *   - 400 on non-WebSocket request
 *   - hello → newcomer learns about existing peers AND existing peers
 *     receive peer-joined for the newcomer
 *   - second hello on the same socket is ignored
 *   - offer / answer / ice are forwarded ONLY to the addressed peer
 *   - close removes the peer and broadcasts peer-left
 *   - non-JSON / malformed messages are silently dropped
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { SignalRoom } from './signal-room';

// ---------------------------------------------------------------------------
// Fake WebSocketPair — records sent messages and lets the test drive events.
// ---------------------------------------------------------------------------

interface FakeWebSocket {
  readyState: number;
  sent: string[];
  listeners: Map<string, Set<(event: unknown) => void>>;
  send(data: string): void;
  addEventListener(type: string, fn: (event: unknown) => void): void;
  accept(): void;
  fire(type: string, event?: unknown): void;
}

function makePair(): { client: FakeWebSocket; server: FakeWebSocket } {
  function makeWs(): FakeWebSocket {
    const ws: FakeWebSocket = {
      readyState: 1,
      sent: [],
      listeners: new Map(),
      send(data: string) {
        ws.sent.push(data);
      },
      addEventListener(type: string, fn: (event: unknown) => void) {
        let bucket = ws.listeners.get(type);
        if (!bucket) {
          bucket = new Set();
          ws.listeners.set(type, bucket);
        }
        bucket.add(fn);
      },
      accept() {
        /* no-op */
      },
      fire(type: string, event?: unknown) {
        const bucket = ws.listeners.get(type);
        if (!bucket) return;
        for (const fn of bucket) fn(event);
      },
    };
    return ws;
  }
  return { client: makeWs(), server: makeWs() };
}

let originalPair: unknown;
let pairs: Array<{ client: FakeWebSocket; server: FakeWebSocket }>;

beforeEach(() => {
  pairs = [];
  originalPair = (globalThis as unknown as { WebSocketPair?: unknown }).WebSocketPair;
  (globalThis as unknown as { WebSocketPair: unknown }).WebSocketPair = function FakePair() {
    const p = makePair();
    pairs.push(p);
    return { 0: p.client, 1: p.server };
  };
});

afterEach(() => {
  (globalThis as unknown as { WebSocketPair: unknown }).WebSocketPair = originalPair;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRoom(): SignalRoom {
  const fakeStorage = {
    storage: {
      async get() {
        return undefined;
      },
      async put() {
        /* no-op */
      },
    },
  };
  return new SignalRoom(fakeStorage as never, {});
}

function connectPeer(room: SignalRoom): FakeWebSocket {
  // Bypass the Workers-only `new Response({ status: 101, webSocket })`
  // path and exercise the routing logic directly.
  const pair = makePair();
  pairs.push(pair);
  room.acceptPeer(pair.server as unknown as WebSocket);
  return pair.server;
}

function sentJson(ws: FakeWebSocket): unknown[] {
  return ws.sent.map((s) => JSON.parse(s));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SignalRoom — connection lifecycle', () => {
  test('rejects non-WebSocket requests with 400', async () => {
    const room = makeRoom();
    const res = await room.fetch(new Request('https://shippie.app/__shippie/signal/x'));
    expect(res.status).toBe(400);
  });
});

describe('SignalRoom — hello handshake', () => {
  test('newcomer learns about existing peers and existing peers see the newcomer', async () => {
    const room = makeRoom();
    const a = connectPeer(room);
    a.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'peer-a' }) });
    // First peer alone — no peers to announce, no announcements to receive
    expect(a.sent.length).toBe(0);

    const b = connectPeer(room);
    b.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'peer-b' }) });

    // b should have learned about a
    expect(sentJson(b)).toEqual([{ t: 'peer-joined', peerId: 'peer-a' }]);
    // a should have been notified of b joining
    expect(sentJson(a)).toEqual([{ t: 'peer-joined', peerId: 'peer-b' }]);
  });

  test('hello is idempotent on the same socket', async () => {
    const room = makeRoom();
    const a = connectPeer(room);
    a.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'peer-a' }) });
    a.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'peer-x' }) });

    const b = connectPeer(room);
    b.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'peer-b' }) });

    // The second hello on socket `a` was ignored, so b learns about peer-a only.
    expect(sentJson(b)).toEqual([{ t: 'peer-joined', peerId: 'peer-a' }]);
  });
});

describe('SignalRoom — targeted relay', () => {
  test('offer is forwarded only to the addressed peer', async () => {
    const room = makeRoom();
    const a = connectPeer(room);
    a.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'a' }) });
    const b = connectPeer(room);
    b.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'b' }) });
    const c = connectPeer(room);
    c.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'c' }) });

    a.sent.length = 0;
    b.sent.length = 0;
    c.sent.length = 0;

    a.fire('message', {
      data: JSON.stringify({ t: 'offer', from: 'a', to: 'c', sdp: 'sdp-blob' }),
    });

    expect(b.sent.length).toBe(0);
    expect(sentJson(c)).toEqual([{ t: 'offer', from: 'a', to: 'c', sdp: 'sdp-blob' }]);
  });

  test('ice candidate routes to addressed peer only', async () => {
    const room = makeRoom();
    const a = connectPeer(room);
    a.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'a' }) });
    const b = connectPeer(room);
    b.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'b' }) });

    b.sent.length = 0;

    a.fire('message', {
      data: JSON.stringify({
        t: 'ice',
        from: 'a',
        to: 'b',
        candidate: { candidate: 'c=1' },
      }),
    });
    expect(sentJson(b)).toEqual([
      { t: 'ice', from: 'a', to: 'b', candidate: { candidate: 'c=1' } },
    ]);
  });

  test('targeted message to non-existent peer is silently dropped', async () => {
    const room = makeRoom();
    const a = connectPeer(room);
    a.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'a' }) });
    a.sent.length = 0;
    a.fire('message', {
      data: JSON.stringify({ t: 'offer', from: 'a', to: 'ghost', sdp: 'x' }),
    });
    expect(a.sent.length).toBe(0);
  });
});

describe('SignalRoom — disconnect', () => {
  test('close removes peer and broadcasts peer-left', async () => {
    const room = makeRoom();
    const a = connectPeer(room);
    a.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'a' }) });
    const b = connectPeer(room);
    b.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'b' }) });

    b.sent.length = 0;
    a.fire('close');

    expect(sentJson(b)).toEqual([{ t: 'peer-left', peerId: 'a' }]);

    // After a leaves, a new join should NOT see a in the existing-peers list.
    const c = connectPeer(room);
    c.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'c' }) });
    expect(sentJson(c)).toEqual([{ t: 'peer-joined', peerId: 'b' }]);
  });
});

describe('SignalRoom — malformed input', () => {
  test('non-JSON message is dropped', async () => {
    const room = makeRoom();
    const a = connectPeer(room);
    a.fire('message', { data: 'not json' });
    a.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'a' }) });
    const b = connectPeer(room);
    b.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'b' }) });
    expect(sentJson(b)).toEqual([{ t: 'peer-joined', peerId: 'a' }]);
  });

  test('message with non-string `t` is dropped', async () => {
    const room = makeRoom();
    const a = connectPeer(room);
    a.fire('message', { data: JSON.stringify({ t: 999 }) });
    expect(a.sent.length).toBe(0);
  });
});

describe('SignalRoom — relay fan-out', () => {
  test('relay broadcasts payload to other peers, not the sender', async () => {
    const room = makeRoom();
    const a = connectPeer(room);
    a.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'a' }) });
    const b = connectPeer(room);
    b.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'b' }) });
    const c = connectPeer(room);
    c.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'c' }) });

    a.sent.length = 0;
    b.sent.length = 0;
    c.sent.length = 0;

    a.fire('message', { data: JSON.stringify({ t: 'relay', payload: 'opaque-bytes' }) });

    expect(a.sent.length).toBe(0); // sender never receives its own relay
    expect(sentJson(b)).toEqual([{ t: 'relay', from: 'a', payload: 'opaque-bytes' }]);
    expect(sentJson(c)).toEqual([{ t: 'relay', from: 'a', payload: 'opaque-bytes' }]);
  });

  test('relay before hello is silently dropped (only authenticated peers)', async () => {
    const room = makeRoom();
    const a = connectPeer(room);
    const b = connectPeer(room);
    b.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'b' }) });
    b.sent.length = 0;

    // a never sent hello; its relay must not reach b.
    a.fire('message', { data: JSON.stringify({ t: 'relay', payload: 'sneaky' }) });

    expect(b.sent.length).toBe(0);
  });

  test('relay with non-string payload is dropped', async () => {
    const room = makeRoom();
    const a = connectPeer(room);
    a.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'a' }) });
    const b = connectPeer(room);
    b.fire('message', { data: JSON.stringify({ t: 'hello', peerId: 'b' }) });
    b.sent.length = 0;

    a.fire('message', { data: JSON.stringify({ t: 'relay', payload: 42 }) });

    expect(b.sent.length).toBe(0);
  });
});
