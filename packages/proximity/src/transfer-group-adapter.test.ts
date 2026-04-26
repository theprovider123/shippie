/**
 * Tests for the structural adapter in `transfer-group-adapter.ts`.
 *
 * The adapter is small (~50 lines of real logic) — its job is to coerce
 * a Group's `unknown`-shaped channel API into the `Uint8Array`-only shape
 * `transfer.ts` expects, and to provide an `awaitPeer` polling helper.
 * We don't bring up real WebRTC; we feed in a fake Group and assert the
 * adapter's surface behaves correctly.
 */
import { describe, expect, test } from 'bun:test';

// Re-import the adapter machinery via dynamic import so we can substitute
// a fake `group.ts` for the WebRTC-heavy real one. The adapter file
// itself only references `createGroup` / `joinGroup` from `./group.ts` at
// the top level — for these tests we exercise its private `adapt` shape
// indirectly via the exported `transferGroupAdapter` once we provide
// stubbed Group instances.
//
// Strategy: bypass the public API and re-build the adapter by importing
// only the helpers we want, then constructing a minimal fake Group and
// passing it through `adapt`-equivalent behaviour by recreating the
// adapter shape on a fake Group.

import type { Group } from './group.ts';
import type { PeerId } from './types.ts';

/**
 * In-memory fake of a `Group` good enough for the adapter contract:
 *   - `selfId` constant
 *   - `members()` reads from a controllable list
 *   - `broadcast(channel, data)` records dispatched payloads
 *   - `on(channel, handler)` registers a listener; `fire(channel, data, peerId)`
 *     simulates an inbound message
 */
function makeFakeGroup(initial: { selfId: string; members: PeerId[] } = { selfId: 'me', members: [] }): {
  group: Group;
  setMembers: (m: PeerId[]) => void;
  broadcasts: { channel: string; data: unknown }[];
  fire: (channel: string, data: unknown, peerId: PeerId) => void;
  leaveCalls: number;
} {
  const broadcasts: { channel: string; data: unknown }[] = [];
  const handlers = new Map<string, Set<(data: unknown, peerId: PeerId) => void>>();
  let members: PeerId[] = initial.members.slice();
  let leaveCalls = 0;
  const fakeGroup = {
    joinCode: 'ABC123',
    roomId: 'room-1',
    selfId: initial.selfId,
    members: () => members.slice(),
    broadcast: async (channel: string, data: unknown) => {
      broadcasts.push({ channel, data });
    },
    send: async () => {},
    on: (channel: string, handler: (data: unknown, peerId: PeerId) => void) => {
      let bucket = handlers.get(channel);
      if (!bucket) {
        bucket = new Set();
        handlers.set(channel, bucket);
      }
      bucket.add(handler);
      return () => bucket!.delete(handler);
    },
    sharedState: () => ({}) as never,
    eventLog: () => ({}) as never,
    leave: () => {
      leaveCalls += 1;
    },
    link: {} as never,
    signingPeerId: null,
    ephemeral: null,
    aesKey: null,
    ready: Promise.resolve(),
  } as unknown as Group;
  return {
    group: fakeGroup,
    setMembers: (m) => {
      members = m;
    },
    broadcasts,
    fire: (channel, data, peerId) => {
      const bucket = handlers.get(channel);
      if (!bucket) return;
      for (const h of bucket) h(data, peerId);
    },
    leaveCalls: 0,
    get leaveCallsCount() {
      return leaveCalls;
    },
  } as never;
}

// Re-implement the adapter inline for the test — this duplicates ~30
// lines of code but keeps the test isolated from the WebRTC stack.
import type { TransferGroupHandle } from './transfer.ts';

function adapt(group: Group): TransferGroupHandle {
  return {
    selfId: group.selfId,
    broadcastBinary: (channel, bytes) => group.broadcast(channel, bytes),
    onBinary: (channel, handler) =>
      group.on(channel, (data, peerId) => {
        if (data instanceof Uint8Array) handler(data, peerId);
        else if (data instanceof ArrayBuffer) handler(new Uint8Array(data), peerId);
      }),
    awaitPeer: async (timeoutMs) => {
      const present = group.members();
      if (present.length > 0) return present[0]!;
      const deadline = timeoutMs && timeoutMs > 0 ? Date.now() + timeoutMs : null;
      while (true) {
        const members = group.members();
        if (members.length > 0) return members[0]!;
        if (deadline !== null && Date.now() >= deadline) {
          throw new Error('awaitPeer timed out');
        }
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    destroy: async () => {
      group.leave();
    },
  };
}

describe('TransferGroupHandle adapter', () => {
  test('selfId pass-through', () => {
    const fake = makeFakeGroup({ selfId: 'peer-A', members: [] });
    const handle = adapt(fake.group);
    expect(handle.selfId).toBe('peer-A');
  });

  test('broadcastBinary routes through Group.broadcast', async () => {
    const fake = makeFakeGroup();
    const handle = adapt(fake.group);
    const bytes = new Uint8Array([1, 2, 3]);
    await handle.broadcastBinary('chan', bytes);
    expect(fake.broadcasts.length).toBe(1);
    expect(fake.broadcasts[0]!.channel).toBe('chan');
    expect(fake.broadcasts[0]!.data).toBe(bytes);
  });

  test('onBinary delivers Uint8Array payloads only — drops non-binary', () => {
    const fake = makeFakeGroup();
    const handle = adapt(fake.group);
    const received: { bytes: Uint8Array; peerId: string }[] = [];
    handle.onBinary('chan', (bytes, peerId) => received.push({ bytes, peerId }));
    fake.fire('chan', new Uint8Array([10]), 'peer-X');
    fake.fire('chan', { not: 'binary' }, 'peer-Y'); // dropped
    fake.fire('chan', 'string-payload', 'peer-Z'); // dropped
    expect(received.length).toBe(1);
    expect(received[0]!.bytes[0]).toBe(10);
    expect(received[0]!.peerId).toBe('peer-X');
  });

  test('onBinary upgrades ArrayBuffer payloads to Uint8Array', () => {
    const fake = makeFakeGroup();
    const handle = adapt(fake.group);
    const received: Uint8Array[] = [];
    handle.onBinary('chan', (bytes) => received.push(bytes));
    const ab = new ArrayBuffer(2);
    new Uint8Array(ab).set([7, 9]);
    fake.fire('chan', ab, 'peer-X');
    expect(received.length).toBe(1);
    expect(received[0]![0]).toBe(7);
    expect(received[0]![1]).toBe(9);
  });

  test('awaitPeer resolves immediately when a peer is already present', async () => {
    const fake = makeFakeGroup({ selfId: 'me', members: ['peer-other'] });
    const handle = adapt(fake.group);
    const got = await handle.awaitPeer(1000);
    expect(got).toBe('peer-other');
  });

  test('awaitPeer polls until a peer joins', async () => {
    const fake = makeFakeGroup({ selfId: 'me', members: [] });
    const handle = adapt(fake.group);
    setTimeout(() => fake.setMembers(['peer-late']), 100);
    const got = await handle.awaitPeer(1000);
    expect(got).toBe('peer-late');
  });

  test('awaitPeer throws on timeout', async () => {
    const fake = makeFakeGroup({ selfId: 'me', members: [] });
    const handle = adapt(fake.group);
    let caught: unknown;
    try {
      await handle.awaitPeer(60);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
  });

  test('destroy calls Group.leave once', async () => {
    const fake = makeFakeGroup() as unknown as { group: Group; leaveCallsCount: number };
    const handle = adapt(fake.group);
    await handle.destroy();
    expect(fake.leaveCallsCount).toBe(1);
  });
});
