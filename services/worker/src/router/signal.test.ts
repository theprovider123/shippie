/**
 * Tests for the signal router and the in-memory dev fan-out.
 *
 * The Cloudflare DO + WebSocketPair path is exercised end-to-end only
 * under miniflare (out of scope here). Instead we:
 *   1. validate the route gate: bad roomId → 400, no upgrade → 426,
 *      DO binding present → DO is dispatched with the raw request.
 *   2. drive `handleFrame` directly to confirm fan-out semantics.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { createApp } from '../app.ts';
import type { WorkerEnv } from '../env.ts';
import type { KvStore, R2Store } from '@shippie/dev-storage';
import {
  clearAllRoomsForTests,
  ensureRoom,
  handleFrame,
  removePeer,
} from './signal-dev.ts';

function fakeKv(data: Record<string, string> = {}): KvStore {
  return {
    get: async (k) => data[k] ?? null,
    getJson: async <T>(k: string) => (data[k] ? (JSON.parse(data[k]!) as T) : null),
    put: async (k, v) => {
      data[k] = v;
    },
    putJson: async (k, v) => {
      data[k] = JSON.stringify(v);
    },
    delete: async (k) => {
      delete data[k];
    },
    list: async (p) => Object.keys(data).filter((k) => !p || k.startsWith(p)),
  };
}

function emptyR2(): R2Store {
  return {
    get: async () => null,
    head: async () => null,
    put: async () => {},
    delete: async () => {},
    list: async () => [],
  };
}

function baseEnv(extra?: Partial<WorkerEnv>): WorkerEnv {
  return {
    SHIPPIE_ENV: 'test',
    PLATFORM_API_URL: 'https://platform.test',
    WORKER_PLATFORM_SECRET: 'test-secret',
    INVITE_SECRET: 'test-invite-secret',
    APP_CONFIG: fakeKv({}),
    SHIPPIE_APPS: emptyR2(),
    SHIPPIE_PUBLIC: emptyR2(),
    ...extra,
  };
}

const VALID_ROOM = 'a'.repeat(64);

afterEach(() => {
  clearAllRoomsForTests();
});

describe('GET /__shippie/signal/:roomId', () => {
  test('400 on invalid room id', async () => {
    const app = createApp();
    const res = await app.fetch(
      new Request('https://demo.shippie.app/__shippie/signal/not-a-room', {
        headers: { host: 'demo.shippie.app' },
      }),
      baseEnv(),
    );
    expect(res.status).toBe(400);
  });

  test('426 when client did not request websocket upgrade', async () => {
    const app = createApp();
    const res = await app.fetch(
      new Request(`https://demo.shippie.app/__shippie/signal/${VALID_ROOM}`, {
        headers: { host: 'demo.shippie.app' },
      }),
      baseEnv(),
    );
    expect(res.status).toBe(426);
  });

  test('routes to SignalRoom DO when binding is present', async () => {
    const captured: Request[] = [];
    const fakeStub = {
      fetch: async (req: Request) => {
        captured.push(req);
        return new Response(null, { status: 101 });
      },
    };
    const idCalls: string[] = [];
    const env = baseEnv({
      SIGNAL_ROOM: {
        idFromName: (name: string) => {
          idCalls.push(name);
          return { toString: () => `id:${name}` };
        },
        get: () => fakeStub,
      },
    } as unknown as Partial<WorkerEnv>);

    const app = createApp();
    const res = await app.fetch(
      new Request(`https://demo.shippie.app/__shippie/signal/${VALID_ROOM}`, {
        headers: { host: 'demo.shippie.app', upgrade: 'websocket' },
      }),
      env,
    );
    expect(res.status).toBe(101);
    expect(idCalls).toEqual([VALID_ROOM]);
    expect(captured).toHaveLength(1);
    expect(new URL(captured[0]!.url).pathname).toBe(`/__shippie/signal/${VALID_ROOM}`);
  });

  test('503 in dev when no Bun server is registered', async () => {
    const app = createApp();
    const res = await app.fetch(
      new Request(`https://demo.shippie.app/__shippie/signal/${VALID_ROOM}`, {
        headers: { host: 'demo.shippie.app', upgrade: 'websocket' },
      }),
      baseEnv(),
    );
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------
// Wire-protocol fan-out — exercises handleFrame directly. This proves
// the SignalRoom message contract without needing a real WebSocket.
// ---------------------------------------------------------------------

class FakeSocket {
  sent: string[] = [];
  readyState = 1;
  send(s: string) {
    this.sent.push(s);
  }
  close() {
    this.readyState = 3;
  }
}

describe('signal fan-out', () => {
  test('hello broadcasts peer-joined to every other peer', () => {
    const room = ensureRoom('rA');
    const a = new FakeSocket();
    const b = new FakeSocket();
    const c = new FakeSocket();
    handleFrame(room, a, JSON.stringify({ t: 'hello', peerId: 'A' }));
    expect(b.sent).toHaveLength(0);

    handleFrame(room, b, JSON.stringify({ t: 'hello', peerId: 'B' }));
    expect(JSON.parse(a.sent[0]!)).toEqual({ t: 'peer-joined', peerId: 'B' });
    // B also gets told who's already in the room.
    expect(JSON.parse(b.sent[0]!)).toEqual({ t: 'peer-joined', peerId: 'A' });

    handleFrame(room, c, JSON.stringify({ t: 'hello', peerId: 'C' }));
    expect(a.sent.map((s) => JSON.parse(s).peerId)).toContain('C');
    expect(b.sent.map((s) => JSON.parse(s).peerId)).toContain('C');
    // C is told about both A and B.
    const cAnnounced = c.sent.map((s) => JSON.parse(s).peerId);
    expect(cAnnounced).toContain('A');
    expect(cAnnounced).toContain('B');
  });

  test('offer is forwarded only to the addressed peer', () => {
    const room = ensureRoom('rB');
    const a = new FakeSocket();
    const b = new FakeSocket();
    const c = new FakeSocket();
    handleFrame(room, a, JSON.stringify({ t: 'hello', peerId: 'A' }));
    handleFrame(room, b, JSON.stringify({ t: 'hello', peerId: 'B' }));
    handleFrame(room, c, JSON.stringify({ t: 'hello', peerId: 'C' }));
    a.sent.length = 0;
    b.sent.length = 0;
    c.sent.length = 0;

    handleFrame(
      room,
      a,
      JSON.stringify({ t: 'offer', from: 'A', to: 'C', sdp: 'V0' }),
    );
    expect(b.sent).toHaveLength(0);
    expect(c.sent).toHaveLength(1);
    expect(JSON.parse(c.sent[0]!)).toEqual({ t: 'offer', from: 'A', to: 'C', sdp: 'V0' });
  });

  test('removePeer broadcasts peer-left', () => {
    const room = ensureRoom('rC');
    const a = new FakeSocket();
    const b = new FakeSocket();
    handleFrame(room, a, JSON.stringify({ t: 'hello', peerId: 'A' }));
    handleFrame(room, b, JSON.stringify({ t: 'hello', peerId: 'B' }));
    a.sent.length = 0;
    b.sent.length = 0;

    removePeer(room, a);
    expect(JSON.parse(b.sent[0]!)).toEqual({ t: 'peer-left', peerId: 'A' });
  });

  test('ignores invalid JSON / unknown messages', () => {
    const room = ensureRoom('rD');
    const a = new FakeSocket();
    handleFrame(room, a, '{not json');
    handleFrame(room, a, JSON.stringify({ no: 't' }));
    expect(a.sent).toHaveLength(0);
  });

  test('ignores hello with empty peerId', () => {
    const room = ensureRoom('rE');
    const a = new FakeSocket();
    handleFrame(room, a, JSON.stringify({ t: 'hello', peerId: '' }));
    expect(room.peers.size).toBe(0);
  });
});
