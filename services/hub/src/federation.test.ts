import { describe, expect, test } from 'bun:test';
import {
  createFederationLink,
  type CatalogEntry,
  type FederationMessage,
  type SignedMessage,
} from './federation.ts';

function mockSign(message: FederationMessage, secret: string): Promise<string> {
  return Promise.resolve(`sig:${secret}:${message.kind}:${message.ts}`);
}

function mockVerify(signed: SignedMessage, secret: string): Promise<boolean> {
  return Promise.resolve(signed.sig === `sig:${secret}:${signed.message.kind}:${signed.message.ts}`);
}

describe('createFederationLink — peer management', () => {
  test('starts with seeded staticPeers', () => {
    const link = createFederationLink({
      hubId: 'hub-a',
      adminSecret: 'shared',
      staticPeers: ['http://hub-b.local:8000', 'http://hub-c.local:8000'],
    });
    expect(link.peers().map((p) => p.url)).toEqual([
      'http://hub-b.local:8000',
      'http://hub-c.local:8000',
    ]);
  });

  test('addPeer is idempotent', () => {
    const link = createFederationLink({ hubId: 'hub-a', adminSecret: 's' });
    link.addPeer('http://hub-b.local:8000');
    link.addPeer('http://hub-b.local:8000');
    expect(link.peers()).toHaveLength(1);
  });

  test('removePeer drops the peer and emits peer-lost', () => {
    const events: string[] = [];
    const link = createFederationLink({
      hubId: 'hub-a',
      adminSecret: 's',
      onEvent: (e) => events.push(e.kind),
    });
    link.addPeer('http://hub-b.local:8000');
    link.removePeer('http://hub-b.local:8000');
    expect(events).toContain('peer-discovered');
    expect(events).toContain('peer-lost');
    expect(link.peers()).toHaveLength(0);
  });
});

describe('createFederationLink — ingest + verify', () => {
  test('rejects messages with a bad signature', async () => {
    const events: string[] = [];
    const link = createFederationLink({
      hubId: 'hub-a',
      adminSecret: 'shared',
      sign: mockSign,
      verify: mockVerify,
      onEvent: (e) => events.push(e.kind),
    });
    const bad: SignedMessage = {
      message: { kind: 'hub.heartbeat', hubId: 'hub-b', ts: Date.now(), payload: {} },
      sig: 'forged',
    };
    await link.ingest(JSON.stringify(bad));
    expect(events).toContain('message-rejected');
  });

  test('rejects malformed JSON', async () => {
    const events: string[] = [];
    const link = createFederationLink({
      hubId: 'hub-a',
      adminSecret: 'shared',
      sign: mockSign,
      verify: mockVerify,
      onEvent: (e) => events.push(e.kind),
    });
    await link.ingest('not-json');
    expect(events).toContain('message-rejected');
  });

  test('rejects messages older than 5 minutes', async () => {
    const events: string[] = [];
    const link = createFederationLink({
      hubId: 'hub-a',
      adminSecret: 'shared',
      sign: mockSign,
      verify: mockVerify,
      onEvent: (e) => events.push(e.kind),
    });
    const ts = Date.now() - 10 * 60_000;
    const msg: FederationMessage = { kind: 'hub.heartbeat', hubId: 'hub-b', ts, payload: {} };
    const sig = await mockSign(msg, 'shared');
    await link.ingest(JSON.stringify({ message: msg, sig }));
    expect(events).toContain('message-rejected');
  });

  test('delivers a valid message to subscribers', async () => {
    const link = createFederationLink({
      hubId: 'hub-a',
      adminSecret: 'shared',
      sign: mockSign,
      verify: mockVerify,
    });
    const received: FederationMessage[] = [];
    link.onMessage('hub.catalog.delta', (m) => received.push(m));
    const ts = Date.now();
    const msg: FederationMessage<CatalogEntry[]> = {
      kind: 'hub.catalog.delta',
      hubId: 'hub-b',
      ts,
      payload: [
        {
          appId: 'app_x',
          slug: 'x',
          version: '1',
          packageHash: `sha256:${'0'.repeat(64)}`,
          fetchUrl: 'http://hub-b.local:8000/__shippie/packages/app_x',
        },
      ],
    };
    const sig = await mockSign(msg, 'shared');
    await link.ingest(JSON.stringify({ message: msg, sig }));
    expect(received).toHaveLength(1);
    expect((received[0]?.payload as CatalogEntry[])[0]?.slug).toBe('x');
  });

  test('subscriber unsubscribe removes the handler', async () => {
    const link = createFederationLink({
      hubId: 'hub-a',
      adminSecret: 'shared',
      sign: mockSign,
      verify: mockVerify,
    });
    const received: FederationMessage[] = [];
    const off = link.onMessage('hub.heartbeat', (m) => received.push(m));
    off();
    const ts = Date.now();
    const msg: FederationMessage = { kind: 'hub.heartbeat', hubId: 'hub-b', ts, payload: {} };
    const sig = await mockSign(msg, 'shared');
    await link.ingest(JSON.stringify({ message: msg, sig }));
    expect(received).toEqual([]);
  });
});

describe('createFederationLink — sign / verify round trip (default Web Crypto)', () => {
  test('default sign + verify agree', async () => {
    const link = createFederationLink({
      hubId: 'hub-a',
      adminSecret: 'shared-secret',
    });
    const received: FederationMessage[] = [];
    link.onMessage('hub.heartbeat', (m) => received.push(m));
    // Build a real signed message via the link's exposed `publishCatalog`
    // path is awkward without peers; round-trip through ingest manually.
    const ts = Date.now();
    const msg: FederationMessage = { kind: 'hub.heartbeat', hubId: 'hub-b', ts, payload: {} };
    // Sign using the same default impl by spinning up a parallel link.
    const sigBytes = await crypto.subtle.sign(
      'HMAC',
      await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode('shared-secret'),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      ),
      new TextEncoder().encode(JSON.stringify(msg, Object.keys(msg).sort())),
    );
    let sig = '';
    for (const b of new Uint8Array(sigBytes)) sig += b.toString(16).padStart(2, '0');
    await link.ingest(JSON.stringify({ message: msg, sig }));
    expect(received).toHaveLength(1);
  });
});
