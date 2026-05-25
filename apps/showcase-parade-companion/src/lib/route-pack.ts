import { CORRIDOR_EXTENT, FALLBACK_ROUTE_PACK, type MapExtent, type RoutePack } from '../data/parade-2026';
import { isInsideExtent } from './geo';
import bakedRoutePack from '../../public/route-pack.json';

export const LIVE_ROUTE_PACK_STORAGE_KEY = 'parade-companion:live-route-pack:v1';

export type RoutePackSyncResult =
  | { status: 'updated'; pack: RoutePack }
  | { status: 'current'; pack: RoutePack }
  | { status: 'offline'; pack: RoutePack }
  | { status: 'invalid'; pack: RoutePack }
  | { status: 'failed'; pack: RoutePack; error?: unknown };

export function loadRoutePack(): RoutePack {
  const baked = loadBakedRoutePack();
  const live = readCachedRoutePack();
  if (live && comparePackVersions(live.packVersion, baked.packVersion) > 0) return live;
  return baked;
}

export function loadBakedRoutePack(): RoutePack {
  return validateRoutePack(bakedRoutePack) ?? validateRoutePack(FALLBACK_ROUTE_PACK) ?? FALLBACK_ROUTE_PACK;
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
    if (!isInsideExtent({ lng, lat }, CORRIDOR_EXTENT)) return null;
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
    if (!isInsideExtent({ lng: Number(poi.lng), lat: Number(poi.lat) }, CORRIDOR_EXTENT)) return null;
  }

  for (const landmark of input.meetingLandmarks) {
    if (!isRecord(landmark)) return null;
    if (!isNonEmptyString(landmark.id) || !isNonEmptyString(landmark.label)) return null;
    if (!isInsideExtent({ lng: Number(landmark.lng), lat: Number(landmark.lat) }, CORRIDOR_EXTENT)) {
      return null;
    }
  }

  return input as unknown as RoutePack;
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
