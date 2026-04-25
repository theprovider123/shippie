/**
 * Tests for the device-to-device transfer module.
 *
 * The Group dependency is injected as a fake — in real usage the
 * proximity package's `group.ts` provides the WebRTC backed
 * implementation. Here we model the channel as an in-memory
 * pub/sub between an "owner" handle and a "receiver" handle.
 */
import { describe, expect, test } from 'bun:test';
import {
  decodeTransferQr,
  decryptFrame,
  encodeTransferQr,
  encryptFrame,
  generateTransferKey,
  receiveTransfer,
  sendTransfer,
  TRANSFER_CHANNEL,
  type TransferFrame,
  type TransferGroupHandle,
  type TransferSnapshot,
} from './transfer.ts';
import type { PeerId } from './types.ts';

interface PairedGroups {
  owner: TransferGroupHandle;
  receiver: TransferGroupHandle;
}

function pairGroups(): PairedGroups {
  const ownerSubs = new Map<string, Set<(b: Uint8Array, p: PeerId) => void>>();
  const receiverSubs = new Map<string, Set<(b: Uint8Array, p: PeerId) => void>>();

  const owner: TransferGroupHandle = {
    selfId: 'owner-peer',
    broadcastBinary: async (channel, bytes) => {
      const subs = receiverSubs.get(channel);
      if (!subs) return;
      // Microtask ordering matters — use queueMicrotask so the
      // receiver's frame handler observes the same async ordering
      // a real datachannel would deliver.
      const copy = new Uint8Array(bytes);
      await Promise.resolve();
      for (const fn of subs) fn(copy, 'owner-peer');
    },
    onBinary: (channel, fn) => {
      let set = ownerSubs.get(channel);
      if (!set) {
        set = new Set();
        ownerSubs.set(channel, set);
      }
      set.add(fn);
      return () => {
        set!.delete(fn);
      };
    },
    awaitPeer: async () => 'receiver-peer',
    destroy: async () => {},
  };

  const receiver: TransferGroupHandle = {
    selfId: 'receiver-peer',
    broadcastBinary: async (channel, bytes) => {
      const subs = ownerSubs.get(channel);
      if (!subs) return;
      const copy = new Uint8Array(bytes);
      await Promise.resolve();
      for (const fn of subs) fn(copy, 'receiver-peer');
    },
    onBinary: (channel, fn) => {
      let set = receiverSubs.get(channel);
      if (!set) {
        set = new Set();
        receiverSubs.set(channel, set);
      }
      set.add(fn);
      return () => {
        set!.delete(fn);
      };
    },
    awaitPeer: async () => 'owner-peer',
    destroy: async () => {},
  };

  return { owner, receiver };
}

async function* iter<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) yield item;
}

function snapshotOf(input: {
  rows: Array<{ table: string; rows: unknown[] }>;
  files: Array<{ fileId: string; name: string; size: number; mime: string; bytes: Uint8Array[] }>;
}): TransferSnapshot {
  const totalRows = input.rows.reduce((n, r) => n + r.rows.length, 0);
  const totalFiles = input.files.length;
  const totalBytes = input.files.reduce(
    (n, f) => n + f.bytes.reduce((m, b) => m + b.byteLength, 0),
    0,
  );
  return {
    appSlug: 'test',
    schemaVersion: 1,
    totalRows,
    totalFiles,
    totalBytes,
    rows: iter(input.rows),
    files: iter(
      input.files.map((f) => ({
        fileId: f.fileId,
        name: f.name,
        size: f.size,
        mime: f.mime,
        bytes: iter(f.bytes),
      })),
    ),
  };
}

describe('encryptFrame / decryptFrame', () => {
  test('round-trips frames with random IV', async () => {
    const key = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(32),
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    );
    const frame: TransferFrame = { t: 'done' };
    const wireA = await encryptFrame(key, frame);
    const wireB = await encryptFrame(key, frame);
    expect(wireA.byteLength).toBeGreaterThan(12);
    // IVs differ — first 12 bytes shouldn't match.
    expect([...wireA.slice(0, 12)]).not.toEqual([...wireB.slice(0, 12)]);
    const decoded = await decryptFrame(key, wireA);
    expect(decoded).toEqual(frame);
  });

  test('rejects truncated frames', async () => {
    const key = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(32),
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );
    await expect(decryptFrame(key, new Uint8Array(8))).rejects.toThrow(/too short/);
  });
});

describe('end-to-end transfer over fake Group', () => {
  test('transfers manifest, rows, files and emits progress', async () => {
    const { owner, receiver } = pairGroups();
    const transferKey = generateTransferKey();
    const snapshot = snapshotOf({
      rows: [
        { table: 'recipes', rows: [{ id: 1, name: 'pasta' }, { id: 2, name: 'salad' }] },
        { table: 'tags', rows: [{ id: 1, label: 'vegan' }] },
      ],
      files: [
        {
          fileId: 'file-1',
          name: 'pasta.jpg',
          size: 7,
          mime: 'image/jpeg',
          bytes: [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6, 7])],
        },
      ],
    });

    const senderEvents: string[] = [];
    const receiverEvents: string[] = [];
    const applied: TransferFrame[] = [];

    const receivedPromise = receiveTransfer({
      group: receiver,
      transferKey,
      apply: (frame) => {
        applied.push(frame);
      },
      on: (e) => receiverEvents.push(e.type),
    });

    const sendResult = await sendTransfer({
      group: owner,
      transferKey,
      snapshot,
      on: (e) => senderEvents.push(e.type),
      chunkBytes: 4, // tiny chunk size to force multi-chunk file path
    });

    const recvResult = await receivedPromise;

    expect(sendResult.ok).toBe(true);
    expect(recvResult.ok).toBe(true);
    expect(senderEvents).toContain('manifest');
    expect(senderEvents).toContain('done');
    expect(receiverEvents).toContain('manifest');
    expect(receiverEvents).toContain('done');

    // Manifest first
    expect((applied[0] as TransferFrame).t).toBe('manifest');
    // The single file was split into ≥2 chunks because chunkBytes=4 and
    // total bytes is 7.
    const fileChunks = applied.filter(
      (f): f is Extract<TransferFrame, { t: 'file-chunk' }> => f.t === 'file-chunk',
    );
    expect(fileChunks.length).toBeGreaterThanOrEqual(2);
    expect(fileChunks[fileChunks.length - 1]!.last).toBe(true);

    // Rows should be present, in order, intact.
    const rowsFrames = applied.filter(
      (f): f is Extract<TransferFrame, { t: 'rows' }> => f.t === 'rows',
    );
    expect(rowsFrames).toHaveLength(2);
    expect(rowsFrames[0]!.table).toBe('recipes');
    expect(rowsFrames[1]!.table).toBe('tags');

    // The last applied frame is the done sentinel.
    expect((applied[applied.length - 1] as TransferFrame).t).toBe('done');
  });

  test('cancellation by the sender emits cancelled on both sides', async () => {
    const { owner, receiver } = pairGroups();
    const transferKey = generateTransferKey();
    // Build an unbounded source; we'll abort right after manifest.
    async function* never(): AsyncIterable<{ table: string; rows: unknown[] }> {
      let i = 0;
      while (i < 1000) {
        yield { table: 't', rows: [{ i: i++ }] };
        await new Promise((r) => setTimeout(r, 1));
      }
    }
    const snapshot: TransferSnapshot = {
      appSlug: 'test',
      schemaVersion: 1,
      totalRows: 1000,
      totalFiles: 0,
      totalBytes: 0,
      rows: never(),
      files: iter<{
        fileId: string;
        name: string;
        size: number;
        mime: string;
        bytes: AsyncIterable<Uint8Array>;
      }>([]),
    };

    const ac = new AbortController();
    const recvPromise = receiveTransfer({
      group: receiver,
      transferKey,
      apply: () => {},
    });

    setTimeout(() => ac.abort(), 5);

    const sendResult = await sendTransfer({
      group: owner,
      transferKey,
      snapshot,
      signal: ac.signal,
    });

    expect(sendResult.ok).toBe(false);
    expect(sendResult.cancelled).toBe(true);

    const recvResult = await recvPromise;
    expect(recvResult.ok).toBe(false);
    expect(recvResult.cancelled).toBe(true);
  });

  test('receiver rejects frames encrypted with wrong key', async () => {
    const { owner, receiver } = pairGroups();
    const senderKey = generateTransferKey();
    const wrongKey = generateTransferKey();
    expect([...senderKey]).not.toEqual([...wrongKey]);

    const recvPromise = receiveTransfer({
      group: receiver,
      transferKey: wrongKey,
      apply: () => {},
    });

    await sendTransfer({
      group: owner,
      transferKey: senderKey,
      snapshot: snapshotOf({ rows: [], files: [] }),
    });

    const recvResult = await recvPromise;
    expect(recvResult.ok).toBe(false);
    expect(recvResult.error).toBeDefined();
  });
});

describe('QR encoding helpers', () => {
  test('encode/decode round-trips', () => {
    const key = generateTransferKey();
    const url = encodeTransferQr({ joinCode: 'ABCD2345', transferKey: key, appSlug: 'recipes' });
    expect(url.startsWith('shippie-transfer://')).toBe(true);
    const decoded = decodeTransferQr(url);
    expect(decoded).not.toBeNull();
    expect(decoded!.joinCode).toBe('ABCD2345');
    expect(decoded!.appSlug).toBe('recipes');
    expect([...decoded!.transferKey]).toEqual([...key]);
  });

  test('decode rejects bad protocol', () => {
    expect(decodeTransferQr('https://shippie.app/?code=x&k=y')).toBeNull();
  });

  test('decode rejects keys with wrong length', () => {
    const url = `shippie-transfer://?app=r&code=ABCD&k=${'a'.repeat(8)}`;
    expect(decodeTransferQr(url)).toBeNull();
  });
});

// Sanity: TRANSFER_CHANNEL is stable so future protocol versions can
// negotiate without colliding.
describe('protocol constants', () => {
  test('TRANSFER_CHANNEL is namespaced and versioned', () => {
    expect(TRANSFER_CHANNEL).toBe('transfer:v1');
  });
});
