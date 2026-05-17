/**
 * Query helpers for Atlas's three local tables.
 *
 * All async because the backing engine is wa-sqlite + OPFS in
 * production; the in-memory dev mock matches the same async surface.
 */
import type { LocalDbRecord, ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  STOPS_TABLE,
  TILES_TABLE,
  TRIPS_TABLE,
  stopsSchema,
  tilesSchema,
  tripsSchema,
  type Stop,
  type Tile,
  type Trip,
  type TripWithStops,
} from './schema.ts';

type RowOf<T> = T & LocalDbRecord;
const asRow = <T>(value: T): RowOf<T> => value as RowOf<T>;

const initCache = new WeakMap<ShippieLocalDb, Promise<void>>();

export async function ensureSchema(db: ShippieLocalDb): Promise<void> {
  let pending = initCache.get(db);
  if (!pending) {
    pending = (async () => {
      await db.create(TRIPS_TABLE, tripsSchema);
      await db.create(STOPS_TABLE, stopsSchema);
      await db.create(TILES_TABLE, tilesSchema);
    })();
    initCache.set(db, pending);
  }
  await pending;
}

export function newId(prefix = 't'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ── Trips ───────────────────────────────────────────────────────────

export async function listTrips(db: ShippieLocalDb): Promise<Trip[]> {
  await ensureSchema(db);
  return db.query<RowOf<Trip>>(TRIPS_TABLE, { orderBy: { updated_at: 'desc' } });
}

export async function getTrip(db: ShippieLocalDb, id: string): Promise<TripWithStops | null> {
  await ensureSchema(db);
  const trips = await db.query<RowOf<Trip>>(TRIPS_TABLE, { where: { id }, limit: 1 });
  const trip = trips[0];
  if (!trip) return null;
  const stops = await db.query<RowOf<Stop>>(STOPS_TABLE, {
    where: { trip_id: id },
    orderBy: { captured_at: 'asc' },
  });
  return { ...trip, stops };
}

export async function createTrip(
  db: ShippieLocalDb,
  input: Omit<Trip, 'id' | 'created_at' | 'updated_at'> & { id?: string },
): Promise<Trip> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  const trip: Trip = {
    id: input.id ?? newId('trip'),
    name: input.name,
    started_on: input.started_on ?? now,
    ended_on: input.ended_on ?? null,
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
  };
  await db.insert(TRIPS_TABLE, asRow(trip));
  return trip;
}

export async function updateTrip(
  db: ShippieLocalDb,
  id: string,
  patch: Partial<Omit<Trip, 'id' | 'created_at'>>,
): Promise<void> {
  await ensureSchema(db);
  await db.update<RowOf<Trip>>(
    TRIPS_TABLE,
    id,
    asRow({ ...patch, updated_at: new Date().toISOString() }),
  );
}

export async function endTrip(db: ShippieLocalDb, id: string): Promise<void> {
  await updateTrip(db, id, { ended_on: new Date().toISOString() });
}

export async function deleteTrip(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  const stops = await db.query<RowOf<Stop>>(STOPS_TABLE, { where: { trip_id: id } });
  for (const s of stops) await db.delete(STOPS_TABLE, s.id);
  await db.delete(TRIPS_TABLE, id);
}

// ── Stops ───────────────────────────────────────────────────────────

export async function listStops(db: ShippieLocalDb, tripId: string): Promise<Stop[]> {
  await ensureSchema(db);
  return db.query<RowOf<Stop>>(STOPS_TABLE, {
    where: { trip_id: tripId },
    orderBy: { captured_at: 'asc' },
  });
}

export async function pinStop(
  db: ShippieLocalDb,
  input: Omit<Stop, 'id' | 'captured_at'> & { id?: string; captured_at?: string },
): Promise<Stop> {
  await ensureSchema(db);
  const stop: Stop = {
    id: input.id ?? newId('stop'),
    trip_id: input.trip_id,
    lat: input.lat,
    lon: input.lon,
    label: input.label ?? null,
    captured_at: input.captured_at ?? new Date().toISOString(),
    photo_id: input.photo_id ?? null,
    note: input.note ?? null,
  };
  await db.insert(STOPS_TABLE, asRow(stop));
  // Bump the trip's updated_at so list ordering reflects activity.
  await db.update<RowOf<Trip>>(TRIPS_TABLE, input.trip_id, asRow({ updated_at: new Date().toISOString() }));
  return stop;
}

export async function deleteStop(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(STOPS_TABLE, id);
}

// ── Tiles index ─────────────────────────────────────────────────────

export function tileId(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`;
}

export async function recordTile(
  db: ShippieLocalDb,
  tile: Omit<Tile, 'id' | 'fetched_at' | 'last_used_at'> & { fetched_at?: string },
): Promise<Tile> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  const row: Tile = {
    id: tileId(tile.z, tile.x, tile.y),
    trip_id: tile.trip_id ?? null,
    z: tile.z,
    x: tile.x,
    y: tile.y,
    mime: tile.mime ?? 'image/png',
    size_bytes: tile.size_bytes,
    opfs_path: tile.opfs_path,
    fetched_at: tile.fetched_at ?? now,
    last_used_at: now,
  };
  // Upsert — if the tile is already indexed, refresh last_used_at + size.
  const existing = await db.query<RowOf<Tile>>(TILES_TABLE, { where: { id: row.id }, limit: 1 });
  if (existing[0]) {
    await db.update<RowOf<Tile>>(TILES_TABLE, row.id, asRow({
      size_bytes: row.size_bytes,
      opfs_path: row.opfs_path,
      mime: row.mime,
      last_used_at: now,
    }));
    return { ...existing[0], ...row };
  }
  await db.insert(TILES_TABLE, asRow(row));
  return row;
}

export async function touchTile(db: ShippieLocalDb, z: number, x: number, y: number): Promise<void> {
  await ensureSchema(db);
  await db.update<RowOf<Tile>>(TILES_TABLE, tileId(z, x, y), asRow({
    last_used_at: new Date().toISOString(),
  }));
}

export async function listTiles(db: ShippieLocalDb): Promise<Tile[]> {
  await ensureSchema(db);
  return db.query<RowOf<Tile>>(TILES_TABLE, { orderBy: { last_used_at: 'asc' } });
}

export async function totalTileBytes(db: ShippieLocalDb): Promise<number> {
  const tiles = await listTiles(db);
  let total = 0;
  for (const t of tiles) total += Number(t.size_bytes ?? 0);
  return total;
}

export async function deleteTileRow(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(TILES_TABLE, id);
}
