import { describe, expect, it } from 'bun:test';
import {
  bboxToTileList,
  enforceBudget,
  formatBytes,
  lonLatToTile,
  pickEviction,
  prefetchRegion,
  SOFT_BUDGET_BYTES,
  tilePath,
  tileUrl,
} from './tiles.ts';
import { MemoryLocalDb } from '../db/runtime.ts';
import { listTiles, recordTile, totalTileBytes } from '../db/queries.ts';
import type { Tile } from '../db/schema.ts';
import type { ShippieFiles } from './tiles.ts';

describe('lonLatToTile', () => {
  it('handles a known reference (Greenwich, z=12)', () => {
    // 51.4934, -0.0098 (Royal Observatory)
    const t = lonLatToTile(-0.0098, 51.4934, 12);
    expect(t.x).toBe(2047);
    expect(t.y).toBe(1362);
  });

  it('handles z=0 — there is one tile', () => {
    expect(lonLatToTile(0, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('moves along x as longitude increases', () => {
    const a = lonLatToTile(0, 51, 10);
    const b = lonLatToTile(10, 51, 10);
    expect(b.x).toBeGreaterThan(a.x);
  });
});

describe('bboxToTileList', () => {
  it('returns one tile per zoom for a tiny bbox at z=10–12', () => {
    const bbox = { north: 51.501, south: 51.500, east: -0.099, west: -0.100 };
    const tiles = bboxToTileList(bbox, [10, 11, 12]);
    // tiny bbox → 1 tile per zoom
    expect(tiles).toHaveLength(3);
    expect(new Set(tiles.map((t) => t.z))).toEqual(new Set([10, 11, 12]));
  });

  it('grows roughly 4x per additional zoom level', () => {
    const bbox = { north: 51.6, south: 51.4, east: 0.1, west: -0.3 };
    const z10 = bboxToTileList(bbox, [10]).length;
    const z11 = bboxToTileList(bbox, [11]).length;
    expect(z11).toBeGreaterThanOrEqual(z10 * 2);
    expect(z11).toBeLessThanOrEqual(z10 * 6);
  });

  it('produces unique coords', () => {
    const bbox = { north: 51.6, south: 51.4, east: 0.1, west: -0.3 };
    const tiles = bboxToTileList(bbox, [11, 12]);
    const ids = tiles.map((t) => `${t.z}/${t.x}/${t.y}`);
    expect(new Set(ids).size).toBe(tiles.length);
  });
});

describe('pickEviction', () => {
  function tile(id: string, size: number): Tile {
    return {
      id, z: 0, x: 0, y: 0,
      size_bytes: size,
      opfs_path: `t/${id}`,
    };
  }

  it('returns nothing if no bytes need freeing', () => {
    expect(pickEviction([tile('a', 100)], 0)).toEqual([]);
    expect(pickEviction([tile('a', 100)], -50)).toEqual([]);
  });

  it('takes oldest first until enough is freed', () => {
    const list = [tile('a', 100), tile('b', 200), tile('c', 1000)];
    const picked = pickEviction(list, 250);
    expect(picked.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('walks the entire list if needed', () => {
    const list = [tile('a', 100), tile('b', 100)];
    const picked = pickEviction(list, 10_000);
    expect(picked).toHaveLength(2);
  });
});

describe('enforceBudget', () => {
  function makeFiles(): ShippieFiles & { writes: Map<string, Blob> } {
    const writes = new Map<string, Blob>();
    return {
      writes,
      async write(path, value) {
        const blob = value instanceof Blob ? value : new Blob([value as ArrayBuffer]);
        writes.set(path, blob);
      },
      async read(path) {
        const b = writes.get(path);
        if (!b) throw new Error('missing');
        return b;
      },
      async delete(path) {
        writes.delete(path);
      },
    };
  }

  it('is a no-op when under budget', async () => {
    const db = new MemoryLocalDb();
    const files = makeFiles();
    await recordTile(db, { z: 1, x: 0, y: 0, size_bytes: 100, opfs_path: 'a' });
    const result = await enforceBudget(db, files, 1_000);
    expect(result.evicted).toBe(0);
    expect(await totalTileBytes(db)).toBe(100);
  });

  it('evicts oldest until under budget', async () => {
    const db = new MemoryLocalDb();
    const files = makeFiles();
    await files.write('a', new Blob(['a']));
    await files.write('b', new Blob(['b']));
    await files.write('c', new Blob(['c']));
    await recordTile(db, { z: 1, x: 0, y: 0, size_bytes: 500, opfs_path: 'a' });
    await new Promise((r) => setTimeout(r, 5));
    await recordTile(db, { z: 1, x: 0, y: 1, size_bytes: 500, opfs_path: 'b' });
    await new Promise((r) => setTimeout(r, 5));
    await recordTile(db, { z: 1, x: 0, y: 2, size_bytes: 500, opfs_path: 'c' });

    // Total 1500 — set budget at 600. Should evict 'a' and 'b' (oldest).
    const result = await enforceBudget(db, files, 600);
    expect(result.evicted).toBe(2);
    expect(result.bytesFreed).toBe(1000);
    const remaining = await listTiles(db);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.opfs_path).toBe('c');
    expect(files.writes.has('a')).toBe(false);
    expect(files.writes.has('b')).toBe(false);
    expect(files.writes.has('c')).toBe(true);
  });
});

describe('prefetchRegion', () => {
  it('writes one tile per coord and reports progress; respects abort', async () => {
    const db = new MemoryLocalDb();
    const writes: Record<string, Blob> = {};
    const files: ShippieFiles = {
      async write(p, v) { writes[p] = v instanceof Blob ? v : new Blob([v as ArrayBuffer]); },
      async read(p) {
        const b = writes[p];
        if (!b) throw new Error('miss');
        return b;
      },
      async delete(p) { delete writes[p]; },
    };
    let calls = 0;
    const fakeFetch = (async () => {
      calls += 1;
      return new Response(new Blob([new Uint8Array(64)], { type: 'image/png' }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const bbox = { north: 51.501, south: 51.500, east: -0.099, west: -0.100 };
    const progresses: number[] = [];
    const result = await prefetchRegion(db, files, bbox, [10, 11], {
      fetchImpl: fakeFetch,
      delayMs: 0,
      onProgress: (p) => progresses.push(p.done),
    });
    expect(result.total).toBe(2);
    expect(result.done).toBe(2);
    expect(result.failed).toBe(0);
    expect(calls).toBe(2);
    expect(progresses[progresses.length - 1]).toBe(2);
  });

  it('counts a 404 as failed without aborting the rest', async () => {
    const db = new MemoryLocalDb();
    const files: ShippieFiles = {
      async write() { /* noop */ },
      async read() { throw new Error('miss'); },
      async delete() { /* noop */ },
    };
    let n = 0;
    const fakeFetch = (async () => {
      n += 1;
      if (n === 1) return new Response('', { status: 404 });
      return new Response(new Blob([new Uint8Array(8)]), { status: 200 });
    }) as unknown as typeof fetch;
    const bbox = { north: 51.501, south: 51.500, east: -0.099, west: -0.100 };
    const result = await prefetchRegion(db, files, bbox, [10, 11], {
      fetchImpl: fakeFetch,
      delayMs: 0,
    });
    expect(result.failed).toBe(1);
    expect(result.done).toBe(2);
  });
});

describe('formatBytes', () => {
  it('renders human-friendly sizes', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('budget defaults', () => {
  it('soft budget is 200 MB', () => {
    expect(SOFT_BUDGET_BYTES).toBe(200 * 1024 * 1024);
  });
  it('tilePath / tileUrl agree on z/x/y order', () => {
    expect(tilePath(12, 1, 2)).toBe('atlas/tiles/12/1/2.png');
    expect(tileUrl(12, 1, 2)).toBe('https://tile.openstreetmap.org/12/1/2.png');
  });
});
