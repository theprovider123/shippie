import { describe, expect, test } from 'bun:test';
import {
  createGossipNode,
  type GossipMessage,
  type GossipPeer,
} from './gossip.ts';

interface CapturedSend {
  toPeerId: string;
  message: GossipMessage<string>;
}

function fakePeer(id: string, captured: CapturedSend[]): GossipPeer<string> {
  return {
    id,
    send(message) {
      captured.push({ toPeerId: id, message });
    },
  };
}

function deterministicRng(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

describe('createGossipNode — broadcast', () => {
  test('originator includes itself in deduplicated delivery handlers', async () => {
    const captured: CapturedSend[] = [];
    const node = createGossipNode<string>('self', { rng: deterministicRng() });
    const delivered: string[] = [];
    node.onDeliver((payload) => delivered.push(payload));
    await node.broadcast('hello', [fakePeer('a', captured)]);
    expect(delivered).toEqual(['hello']);
  });

  test('fans the message out to up to `fanout` peers', async () => {
    const captured: CapturedSend[] = [];
    const node = createGossipNode<string>('self', { fanout: 2, rng: deterministicRng() });
    const peers = ['a', 'b', 'c', 'd', 'e'].map((id) => fakePeer(id, captured));
    await node.broadcast('hi', peers);
    expect(captured).toHaveLength(2);
    expect(captured[0]?.message.hop).toBe(1);
  });

  test('skips self in fanout (never sends to selfPeerId)', async () => {
    const captured: CapturedSend[] = [];
    const node = createGossipNode<string>('self', { fanout: 5, rng: deterministicRng() });
    const peers = ['self', 'a', 'b'].map((id) => fakePeer(id, captured));
    await node.broadcast('msg', peers);
    expect(captured.every((c) => c.toPeerId !== 'self')).toBe(true);
  });

  test('size reflects dedupe-window membership', async () => {
    const node = createGossipNode<string>('self', { rng: deterministicRng() });
    expect(node.size()).toBe(0);
    await node.broadcast('m1', []);
    expect(node.size()).toBe(1);
    await node.broadcast('m2', []);
    expect(node.size()).toBe(2);
  });
});

describe('createGossipNode — receive', () => {
  function makeMessage(over: Partial<GossipMessage<string>> = {}): GossipMessage<string> {
    return {
      id: 'm1',
      hop: 1,
      originatedAt: Date.now(),
      originPeerId: 'origin',
      payload: 'hello',
      ...over,
    };
  }

  test('delivers a fresh message and forwards to neighbours', async () => {
    const captured: CapturedSend[] = [];
    const node = createGossipNode<string>('self', { fanout: 2, rng: deterministicRng() });
    const delivered: string[] = [];
    node.onDeliver((p) => delivered.push(p));
    const peers = ['a', 'b', 'c'].map((id) => fakePeer(id, captured));
    await node.receive(makeMessage(), peers);
    expect(delivered).toEqual(['hello']);
    expect(captured.length).toBeGreaterThan(0);
    expect(captured.every((c) => c.message.hop === 2)).toBe(true);
  });

  test('drops a duplicate (already in dedupe window)', async () => {
    const captured: CapturedSend[] = [];
    const node = createGossipNode<string>('self', { rng: deterministicRng() });
    const delivered: string[] = [];
    node.onDeliver((p) => delivered.push(p));
    await node.receive(makeMessage(), [fakePeer('a', captured)]);
    await node.receive(makeMessage(), [fakePeer('a', captured)]); // same id
    expect(delivered).toEqual(['hello']);
    // Second receive should produce no fanout.
    expect(captured.length).toBeLessThanOrEqual(1);
  });

  test('drops a stale message older than staleAfterMs', async () => {
    const captured: CapturedSend[] = [];
    const node = createGossipNode<string>('self', {
      staleAfterMs: 1000,
      rng: deterministicRng(),
    });
    const delivered: string[] = [];
    node.onDeliver((p) => delivered.push(p));
    await node.receive(
      makeMessage({ id: 'old', originatedAt: Date.now() - 60_000 }),
      [fakePeer('a', captured)],
    );
    expect(delivered).toEqual([]);
    expect(captured).toEqual([]);
  });

  test('drops messages that exceeded maxHops on forward', async () => {
    const captured: CapturedSend[] = [];
    const node = createGossipNode<string>('self', { maxHops: 3, rng: deterministicRng() });
    await node.receive(makeMessage({ id: 'far', hop: 3 }), [fakePeer('a', captured)]);
    expect(captured).toEqual([]);
  });

  test('skips origin and self in fanout to prevent immediate cycles', async () => {
    const captured: CapturedSend[] = [];
    const node = createGossipNode<string>('self', { fanout: 5, rng: deterministicRng() });
    const peers = ['self', 'origin', 'a', 'b'].map((id) => fakePeer(id, captured));
    await node.receive(
      makeMessage({ id: 'cycle', originPeerId: 'origin' }),
      peers,
    );
    const seenTargets = new Set(captured.map((c) => c.toPeerId));
    expect(seenTargets.has('self')).toBe(false);
    expect(seenTargets.has('origin')).toBe(false);
  });
});

describe('createGossipNode — observability', () => {
  test('onEvent fires for broadcast, receive, duplicate, dropped, forwarded', async () => {
    const events: string[] = [];
    const node = createGossipNode<string>('self', {
      onEvent: (e) => events.push(e.kind),
      rng: deterministicRng(),
    });
    await node.broadcast('hello', [fakePeer('a', [])]);
    await node.receive(
      {
        id: 'r1',
        hop: 0,
        originatedAt: Date.now(),
        originPeerId: 'b',
        payload: 'world',
      },
      [fakePeer('a', [])],
    );
    await node.receive(
      {
        id: 'r1',
        hop: 0,
        originatedAt: Date.now(),
        originPeerId: 'b',
        payload: 'world',
      },
      [],
    );
    expect(events).toContain('broadcast');
    expect(events).toContain('receive');
    expect(events).toContain('duplicate');
    expect(events).toContain('forwarded');
  });
});
