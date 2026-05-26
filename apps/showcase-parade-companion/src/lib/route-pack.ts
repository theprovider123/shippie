import { CORRIDOR_EXTENT, FALLBACK_ROUTE_PACK, type MapExtent, type RoutePack } from '../data/parade-2026';
import { setActiveExtent } from './active-extent';
import { isInsideExtent } from './geo';
import bakedRoutePack from '../../public/route-pack.json';
import watfordPack from '../../public/packs/watford-vicarage.json';

export const LIVE_ROUTE_PACK_STORAGE_KEY = 'parade-companion:live-route-pack:v1';
export const PACK_ID_STORAGE_KEY = 'parade-companion:active-pack-id:v1';
export const DEFAULT_PACK_ID = 'arsenal-islington';

/**
 * Registry of baked packs. Arsenal stays the default and parade-day URL;
 * Watford is the only alternate field-test pack.
 *
 * URL `?pack=<id>` overrides the default. Selection persists to localStorage
 * so a reload (or accidental URL strip after the iframe re-mounts) keeps the
 * choice. Unknown ids fall back to Arsenal silently.
 */
export const PACK_REGISTRY: Record<string, unknown> = {
  'arsenal-islington': bakedRoutePack,
  'watford-vicarage': watfordPack,
};

export function listPackIds(): string[] {
  return Object.keys(PACK_REGISTRY);
}

/**
 * Resolve the active pack id from (in order): explicit arg → URL `?pack=` →
 * localStorage → DEFAULT_PACK_ID. Side-effect: persists the resolved id
 * so subsequent loads stay sticky.
 */
export function resolvePackId(explicit?: string): string {
  const candidates = [
    explicit,
    readPackIdFromUrl(),
    readStoredPackId(),
  ].filter((id): id is string => typeof id === 'string' && id.length > 0);

  for (const id of candidates) {
    if (id in PACK_REGISTRY) {
      writeStoredPackId(id);
      return id;
    }
  }
  return DEFAULT_PACK_ID;
}

function readPackIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('pack');
  } catch {
    return null;
  }
}

function readStoredPackId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(PACK_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredPackId(id: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PACK_ID_STORAGE_KEY, id);
  } catch {
    // Persistence is advisory; URL takes precedence anyway.
  }
}

export type RoutePackSyncResult =
  | { status: 'updated'; pack: RoutePack }
  | { status: 'current'; pack: RoutePack }
  | { status: 'offline'; pack: RoutePack }
  | { status: 'invalid'; pack: RoutePack }
  | { status: 'failed'; pack: RoutePack; error?: unknown };

export function loadRoutePack(explicitPackId?: string): RoutePack {
  const packId = resolvePackId(explicitPackId);
  const baked = loadBakedRoutePack(packId);
  // Only the Arsenal pack gets live-sync overrides (the relay endpoint serves
  // route-pack.json). The Watford test pack always uses the baked version —
  // no relay round-trip needed for local walks.
  const pack = packId === DEFAULT_PACK_ID ? mergeWithLiveCache(baked) : baked;
  setActiveExtent(pack.mapExtent);
  return pack;
}

export function loadBakedRoutePack(packId: string = DEFAULT_PACK_ID): RoutePack {
  const baked = PACK_REGISTRY[packId] ?? bakedRoutePack;
  return validateRoutePack(baked) ?? validateRoutePack(FALLBACK_ROUTE_PACK) ?? FALLBACK_ROUTE_PACK;
}

function mergeWithLiveCache(baked: RoutePack): RoutePack {
  const live = readCachedRoutePack();
  if (live && comparePackVersions(live.packVersion, baked.packVersion) > 0) return live;
  return baked;
}

export async function syncRoutePack(url: string, current: RoutePack = loadRoutePack()): Promise<RoutePackSyncResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { status: 'offline', pack: current };
  }

  try {
    const response = await fetch(cacheBustedUrl(url), {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return { status: 'failed', pack: current };

    const candidate = validateRoutePack(await response.json());
    if (!candidate) return { status: 'invalid', pack: current };

    if (comparePackVersions(candidate.packVersion, current.packVersion) <= 0) {
      return { status: 'current', pack: current };
    }

    writeCachedRoutePack(candidate);
    return { status: 'updated', pack: candidate };
  } catch (error) {
    return { status: 'failed', pack: current, error };
  }
}

export function readCachedRoutePack(): RoutePack | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LIVE_ROUTE_PACK_STORAGE_KEY);
    if (!raw) return null;
    const pack = validateRoutePack(JSON.parse(raw));
    if (!pack) {
      localStorage.removeItem(LIVE_ROUTE_PACK_STORAGE_KEY);
      return null;
    }
    return pack;
  } catch {
    return null;
  }
}

export function writeCachedRoutePack(pack: RoutePack): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(LIVE_ROUTE_PACK_STORAGE_KEY, JSON.stringify(pack));
    return true;
  } catch {
    return false;
  }
}

export function clearCachedRoutePack(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(LIVE_ROUTE_PACK_STORAGE_KEY);
  } catch {
    // A stale live pack must never block the baked offline pack.
  }
}

export function comparePackVersions(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) {
    return Math.sign(leftTime - rightTime);
  }
  return left.localeCompare(right);
}

export function validateRoutePack(input: unknown): RoutePack | null {
  if (!isRecord(input)) return null;
  if (input.schemaVersion !== 1) return null;
  if (!isNonEmptyString(input.packVersion)) return null;
  // mapExtent: validate the pack declares its own bounding box (round 10).
  // Backwards-compat: if missing, fall back to the legacy Islington corridor.
  const mapExtent = validateMapExtent(input.mapExtent) ?? CORRIDOR_EXTENT;
  if (!isRecord(input.event)) return null;
  if (!isNonEmptyString(input.event.title)) return null;
  if (!isNonEmptyString(input.event.dateLabel)) return null;
  if (!isNonEmptyString(input.event.startTime)) return null;
  if (!['route-tbd', 'confirmed', 'updated'].includes(String(input.event.status))) return null;
  if (!isRecord(input.route) || input.route.type !== 'LineString') return null;
  if (!Array.isArray(input.route.coordinates)) return null;
  const coords: [number, number][] = [];
  for (const coord of input.route.coordinates) {
    if (!Array.isArray(coord) || coord.length !== 2) return null;
    const lng = Number(coord[0]);
    const lat = Number(coord[1]);
    // Validate against the pack's OWN declared extent — this is what makes
    // the Watford field-test pack pass Watford bounds.
    if (!isInsideExtent({ lng, lat }, mapExtent)) return null;
    coords.push([lng, lat]);
  }
  if (input.event.status !== 'route-tbd' && coords.length < 2) return null;
  if (!Array.isArray(input.sources) || input.sources.length === 0) return null;
  if (!Array.isArray(input.pois)) return null;
  if (!Array.isArray(input.closures)) return null;
  if (!isRecord(input.transport)) return null;
  if (!Array.isArray(input.meetingLandmarks)) return null;
  if (!Array.isArray(input.safety)) return null;
  if (!Array.isArray(input.scheduleEstimate)) return null;

  for (const poi of input.pois) {
    if (!isRecord(poi)) return null;
    if (!isNonEmptyString(poi.id) || !isNonEmptyString(poi.kind) || !isNonEmptyString(poi.name)) {
      return null;
    }
    if (!isInsideExtent({ lng: Number(poi.lng), lat: Number(poi.lat) }, mapExtent)) return null;
  }

  for (const landmark of input.meetingLandmarks) {
    if (!isRecord(landmark)) return null;
    if (!isNonEmptyString(landmark.id) || !isNonEmptyString(landmark.label)) return null;
    if (!isInsideExtent({ lng: Number(landmark.lng), lat: Number(landmark.lat) }, mapExtent)) {
      return null;
    }
  }

  // Backfill the validated extent so the runtime always reads a complete pack.
  const validated: RoutePack = { ...(input as unknown as RoutePack), mapExtent };
  return validated;
}

function validateMapExtent(input: unknown): MapExtent | null {
  if (!isRecord(input)) return null;
  const west = Number(input.west);
  const east = Number(input.east);
  const south = Number(input.south);
  const north = Number(input.north);
  const pxWidth = Number(input.pxWidth);
  const pxHeight = Number(input.pxHeight);
  if (![west, east, south, north, pxWidth, pxHeight].every(Number.isFinite)) return null;
  if (east <= west || north <= south) return null;
  if (pxWidth <= 0 || pxHeight <= 0) return null;
  return { west, east, south, north, pxWidth, pxHeight };
}

export function eventStartDate(pack: RoutePack): Date {
  return new Date(pack.event.startTime);
}

export function packFreshnessLabel(pack: RoutePack): string {
  const date = new Date(pack.packVersion);
  if (Number.isNaN(date.getTime())) return pack.packVersion;
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/London',
  }).format(date);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function cacheBustedUrl(input: string): string {
  try {
    const base = typeof window === 'undefined' ? 'https://shippie.local/' : window.location.href;
    const url = new URL(input, base);
    url.searchParams.set('live_pack_ts', String(Date.now()));
    return url.toString();
  } catch {
    const joiner = input.includes('?') ? '&' : '?';
    return `${input}${joiner}live_pack_ts=${Date.now()}`;
  }
}
