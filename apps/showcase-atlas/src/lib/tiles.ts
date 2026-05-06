/**
 * Atlas tile pipeline.
 *
 *  - Cache-first lookup against OPFS via `@shippie/local-files`.
 *  - Fall back to OSM standard tile URL on miss.
 *  - Persist each fetched tile back into OPFS + the local DB tile index.
 *  - LRU evict when the indexed total exceeds a soft 200 MB budget.
 *
 * Important constraints (OSM tile usage policy):
 *  - Send a User-Agent identifying Shippie + a contact URL. Browsers
 *    won't let us override the wire UA, but we DO send a `Referer` of
 *    the deployment origin and we keep concurrency low (≤2). On the
 *    "Save region offline" path we additionally serialise requests
 *    with a small per-request delay. Bulk pre-caching only happens
 *    after explicit user opt-in (the button in the Tiles page).
 *  - Attribution is the Leaflet default and stays; do not break it.
 *
 * Pure-math helpers (`bboxToTileList`, `lonLatToTile`) are exported so
 * the test runner can verify them without spinning up OPFS or fetch.
 */
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  deleteTileRow,
  listTiles,
  recordTile,
  tileId,
  totalTileBytes,
  touchTile,
} from '../db/queries.ts';
import type { Tile } from '../db/schema.ts';

export const SOFT_BUDGET_BYTES = 200 * 1024 * 1024; // 200 MB
export const TILE_BASE_URL = 'https://tile.openstreetmap.org';
export const PREFETCH_CONCURRENCY = 2;
export const PREFETCH_DELAY_MS = 80;

export interface ShippieFiles {
  write(path: string, value: Blob | ArrayBuffer | string): Promise<void>;
  read(path: string): Promise<Blob>;
  delete(path: string): Promise<void>;
}

/**
 * OSM uses Web Mercator slippy-map tiles. Standard formulas — see
 * https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames.
 */
export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y };
}

export interface BoundingBox {
  /** Northern latitude (max). */
  north: number;
  /** Southern latitude (min). */
  south: number;
  /** Eastern longitude (max). */
  east: number;
  /** Western longitude (min). */
  west: number;
}

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

/**
 * Enumerate every {z,x,y} tile that intersects `bbox` for each zoom in
 * `zooms`. Pure + deterministic. Used by the prefetch flow + tested
 * directly.
 */
export function bboxToTileList(bbox: BoundingBox, zooms: number[]): TileCoord[] {
  const out: TileCoord[] = [];
  for (const z of zooms) {
    const tl = lonLatToTile(bbox.west, bbox.north, z);
    const br = lonLatToTile(bbox.east, bbox.south, z);
    const xMin = Math.min(tl.x, br.x);
    const xMax = Math.max(tl.x, br.x);
    const yMin = Math.min(tl.y, br.y);
    const yMax = Math.max(tl.y, br.y);
    for (let x = xMin; x <= xMax; x += 1) {
      for (let y = yMin; y <= yMax; y += 1) {
        out.push({ z, x, y });
      }
    }
  }
  return out;
}

/**
 * Pick the LRU rows that, taken together, free at least `bytesNeeded`
 * bytes. Pure: input is an already-sorted-by-last-used-asc tile list.
 *
 * We evict starting from the oldest. A tile is skipped only if the
 * caller flagged it as pinned (e.g. inside an active region); pinning
 * is a UI concern, not part of this primitive.
 */
export function pickEviction(tiles: readonly Tile[], bytesNeeded: number): Tile[] {
  if (bytesNeeded <= 0) return [];
  const out: Tile[] = [];
  let freed = 0;
  for (const t of tiles) {
    if (freed >= bytesNeeded) break;
    out.push(t);
    freed += Number(t.size_bytes ?? 0);
  }
  return out;
}

/**
 * Drop oldest tiles until total size is at-or-below the budget.
 * Removes both the OPFS blob and the index row.
 */
export async function enforceBudget(
  db: ShippieLocalDb,
  files: ShippieFiles,
  budget = SOFT_BUDGET_BYTES,
): Promise<{ evicted: number; bytesFreed: number }> {
  const total = await totalTileBytes(db);
  if (total <= budget) return { evicted: 0, bytesFreed: 0 };
  const tiles = await listTiles(db); // last_used_at asc
  const targets = pickEviction(tiles, total - budget);
  let bytesFreed = 0;
  for (const t of targets) {
    try {
      await files.delete(t.opfs_path);
    } catch {
      // The file may already be gone. Drop the index row anyway —
      // an orphaned row is worse than a missing blob.
    }
    await deleteTileRow(db, t.id);
    bytesFreed += Number(t.size_bytes ?? 0);
  }
  return { evicted: targets.length, bytesFreed };
}

export function tilePath(z: number, x: number, y: number): string {
  return `atlas/tiles/${z}/${x}/${y}.png`;
}

export function tileUrl(z: number, x: number, y: number): string {
  return `${TILE_BASE_URL}/${z}/${x}/${y}.png`;
}

/**
 * Try OPFS first. If the tile is indexed but the blob can't be read,
 * fall through to network so the screen still renders. Network hits
 * also feed back into OPFS + the index.
 */
export async function getOrFetchTile(
  db: ShippieLocalDb,
  files: ShippieFiles,
  coord: TileCoord,
  options: { tripId?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<Blob | null> {
  const { z, x, y } = coord;
  const path = tilePath(z, x, y);
  // Cache hit?
  try {
    const blob = await files.read(path);
    if (blob && blob.size > 0) {
      await touchTile(db, z, x, y);
      return blob;
    }
  } catch {
    // miss
  }
  // Network. Browsers manage UA; we add a Referer so abuse can be traced.
  const fetchFn = options.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchFn) return null;
  let res: Response;
  try {
    res = await fetchFn(tileUrl(z, x, y), {
      headers: {
        Accept: 'image/png,image/*;q=0.8',
      },
      // OSM caches are friendly with default cache mode.
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const blob = await res.blob();
  // Persist + index. Failure to persist is non-fatal; we still return
  // the blob so the map renders.
  try {
    await files.write(path, blob);
    await recordTile(db, {
      z, x, y,
      trip_id: options.tripId ?? null,
      mime: blob.type || 'image/png',
      size_bytes: blob.size,
      opfs_path: path,
    });
  } catch {
    /* non-fatal */
  }
  return blob;
}

export interface PrefetchProgress {
  done: number;
  total: number;
  failed: number;
  bytesAdded: number;
}

/**
 * Bulk fetch the tiles inside a bbox at the given zooms. Throttled to
 * `PREFETCH_CONCURRENCY` parallel requests with a small delay between
 * each completion to be polite to OSM. Skips tiles already in the
 * index. Calls `onProgress` after every tile (success or failure).
 */
export async function prefetchRegion(
  db: ShippieLocalDb,
  files: ShippieFiles,
  bbox: BoundingBox,
  zooms: number[],
  options: {
    tripId?: string | null;
    fetchImpl?: typeof fetch;
    onProgress?: (p: PrefetchProgress) => void;
    signal?: AbortSignal;
    delayMs?: number;
  } = {},
): Promise<PrefetchProgress> {
  const tiles = bboxToTileList(bbox, zooms);
  const progress: PrefetchProgress = {
    done: 0,
    total: tiles.length,
    failed: 0,
    bytesAdded: 0,
  };
  const delay = options.delayMs ?? PREFETCH_DELAY_MS;

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < tiles.length) {
      if (options.signal?.aborted) return;
      const idx = cursor;
      cursor += 1;
      const t = tiles[idx]!;
      const blob = await getOrFetchTile(db, files, t, {
        tripId: options.tripId ?? null,
        fetchImpl: options.fetchImpl,
      });
      if (blob) progress.bytesAdded += blob.size;
      else progress.failed += 1;
      progress.done += 1;
      options.onProgress?.({ ...progress });
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    }
  }
  const workers: Promise<void>[] = [];
  for (let i = 0; i < PREFETCH_CONCURRENCY; i += 1) workers.push(worker());
  await Promise.all(workers);
  // After bulk write, enforce LRU budget.
  await enforceBudget(db, files);
  return progress;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
