import { describe, expect, it } from 'bun:test';
import { MemoryLocalDb } from './runtime.ts';
import {
  createTrip,
  deleteTrip,
  endTrip,
  getTrip,
  listStops,
  listTiles,
  listTrips,
  pinStop,
  recordTile,
  tileId,
  totalTileBytes,
  touchTile,
} from './queries.ts';

describe('trips', () => {
  it('creates and lists a trip', async () => {
    const db = new MemoryLocalDb();
    const trip = await createTrip(db, { name: 'Lake District weekend' });
    expect(trip.id).toBeTruthy();
    expect(trip.started_on).toBeTruthy();
    const all = await listTrips(db);
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe('Lake District weekend');
  });

  it('orders trips by updated_at desc; pinning a stop bumps order', async () => {
    const db = new MemoryLocalDb();
    const a = await createTrip(db, { name: 'Older' });
    // Force distinct updated_at values regardless of clock granularity.
    await new Promise((r) => setTimeout(r, 5));
    const b = await createTrip(db, { name: 'Newer' });
    let listed = await listTrips(db);
    expect(listed[0]!.id).toBe(b.id);

    await new Promise((r) => setTimeout(r, 5));
    await pinStop(db, { trip_id: a.id, lat: 0, lon: 0 });
    listed = await listTrips(db);
    expect(listed[0]!.id).toBe(a.id);
  });

  it('cascades stops when a trip is deleted', async () => {
    const db = new MemoryLocalDb();
    const trip = await createTrip(db, { name: 'Doomed' });
    await pinStop(db, { trip_id: trip.id, lat: 1, lon: 1 });
    await pinStop(db, { trip_id: trip.id, lat: 2, lon: 2 });

    const before = await listStops(db, trip.id);
    expect(before).toHaveLength(2);

    await deleteTrip(db, trip.id);
    expect(await getTrip(db, trip.id)).toBeNull();
    const remaining = await db.query('stops');
    expect(remaining).toHaveLength(0);
  });

  it('endTrip stamps ended_on', async () => {
    const db = new MemoryLocalDb();
    const trip = await createTrip(db, { name: 'Day hike' });
    await endTrip(db, trip.id);
    const loaded = await getTrip(db, trip.id);
    expect(loaded?.ended_on).toBeTruthy();
  });
});

describe('stops', () => {
  it('orders stops by captured_at asc within a trip', async () => {
    const db = new MemoryLocalDb();
    const trip = await createTrip(db, { name: 'Coast' });
    const earlier = await pinStop(db, {
      trip_id: trip.id,
      lat: 51.5,
      lon: -0.12,
      captured_at: '2026-05-01T08:00:00Z',
    });
    const later = await pinStop(db, {
      trip_id: trip.id,
      lat: 51.6,
      lon: -0.13,
      captured_at: '2026-05-01T16:00:00Z',
    });
    const stops = await listStops(db, trip.id);
    expect(stops.map((s) => s.id)).toEqual([earlier.id, later.id]);
  });
});

describe('tiles', () => {
  it('records a tile, upserts on the same z/x/y, and tracks size', async () => {
    const db = new MemoryLocalDb();
    const t1 = await recordTile(db, {
      z: 12, x: 100, y: 200,
      size_bytes: 5_000,
      opfs_path: 'tiles/12/100/200.png',
    });
    expect(t1.id).toBe(tileId(12, 100, 200));

    // Re-recording bumps last_used_at + updates size; doesn't duplicate.
    await recordTile(db, {
      z: 12, x: 100, y: 200,
      size_bytes: 6_000,
      opfs_path: 'tiles/12/100/200.png',
    });
    const all = await listTiles(db);
    expect(all).toHaveLength(1);
    expect(Number(all[0]!.size_bytes)).toBe(6_000);
  });

  it('totalTileBytes sums sizes across rows', async () => {
    const db = new MemoryLocalDb();
    await recordTile(db, { z: 12, x: 0, y: 0, size_bytes: 1000, opfs_path: 'a' });
    await recordTile(db, { z: 12, x: 0, y: 1, size_bytes: 2500, opfs_path: 'b' });
    expect(await totalTileBytes(db)).toBe(3500);
  });

  it('touchTile updates last_used_at to drive LRU ordering', async () => {
    const db = new MemoryLocalDb();
    await recordTile(db, { z: 12, x: 0, y: 0, size_bytes: 100, opfs_path: 'a' });
    await new Promise((r) => setTimeout(r, 5));
    await recordTile(db, { z: 12, x: 0, y: 1, size_bytes: 100, opfs_path: 'b' });
    await new Promise((r) => setTimeout(r, 5));
    await touchTile(db, 12, 0, 0);
    const tiles = await listTiles(db);
    // listTiles orders by last_used_at asc → least-recently-used first.
    expect(tiles[0]!.id).toBe(tileId(12, 0, 1));
    expect(tiles[1]!.id).toBe(tileId(12, 0, 0));
  });
});
