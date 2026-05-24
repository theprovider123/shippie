import type { KVNamespace } from '@cloudflare/workers-types';

export const LIVE_ROUTE_PACK_KV_KEY = 'parade:2026-05-31:route-pack:live';

const MAX_ROUTE_PACK_BYTES = 256 * 1024;
const CORRIDOR_EXTENT = {
  west: -0.125,
  east: -0.085,
  south: 51.531,
  north: 51.566,
};

export interface LiveRoutePackSummary {
  packVersion: string;
  title: string;
  dateLabel: string;
  status: string;
  sourceCount: number;
  poiCount: number;
  scheduleCount: number;
}

export type LiveRoutePackParseResult =
  | { ok: true; normalized: string; summary: LiveRoutePackSummary }
  | { ok: false; error: string };

export async function readLiveRoutePack(kv: KVNamespace | undefined): Promise<string | null> {
  if (!kv) return null;
  return kv.get(LIVE_ROUTE_PACK_KV_KEY);
}

export async function writeLiveRoutePack(kv: KVNamespace, raw: string): Promise<LiveRoutePackParseResult> {
  const parsed = parseLiveRoutePack(raw);
  if (!parsed.ok) return parsed;
  await kv.put(LIVE_ROUTE_PACK_KV_KEY, parsed.normalized);
  return parsed;
}

export async function deleteLiveRoutePack(kv: KVNamespace | undefined): Promise<void> {
  if (!kv) return;
  await kv.delete(LIVE_ROUTE_PACK_KV_KEY);
}

export async function liveRoutePackSummary(kv: KVNamespace | undefined): Promise<LiveRoutePackSummary | null> {
  const raw = await readLiveRoutePack(kv);
  if (!raw) return null;
  const parsed = parseLiveRoutePack(raw);
  return parsed.ok ? parsed.summary : null;
}

export function parseLiveRoutePack(raw: string): LiveRoutePackParseResult {
  if (new TextEncoder().encode(raw).byteLength > MAX_ROUTE_PACK_BYTES) {
    return { ok: false, error: 'Route pack is too large. Keep it under 256 KB.' };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Route pack is not valid JSON.' };
  }

  const validation = validateRoutePackShape(json);
  if (!validation.ok) return validation;

  return {
    ok: true,
    normalized: `${JSON.stringify(json, null, 2)}\n`,
    summary: validation.summary,
  };
}

function validateRoutePackShape(input: unknown): { ok: true; summary: LiveRoutePackSummary } | { ok: false; error: string } {
  if (!isRecord(input)) return { ok: false, error: 'Route pack must be a JSON object.' };
  if (input.schemaVersion !== 1) return { ok: false, error: 'schemaVersion must be 1.' };
  if (!isNonEmptyString(input.packVersion)) return { ok: false, error: 'packVersion is required.' };
  if (Number.isNaN(Date.parse(input.packVersion))) return { ok: false, error: 'packVersion must be an ISO date string.' };
  if (!isRecord(input.event)) return { ok: false, error: 'event is required.' };
  if (!isNonEmptyString(input.event.title)) return { ok: false, error: 'event.title is required.' };
  if (!isNonEmptyString(input.event.dateLabel)) return { ok: false, error: 'event.dateLabel is required.' };
  if (!isNonEmptyString(input.event.startTime)) return { ok: false, error: 'event.startTime is required.' };
  if (!['route-tbd', 'confirmed', 'updated'].includes(String(input.event.status))) {
    return { ok: false, error: 'event.status must be route-tbd, confirmed, or updated.' };
  }
  if (!isRecord(input.route) || input.route.type !== 'LineString') {
    return { ok: false, error: 'route must be a LineString.' };
  }
  if (!Array.isArray(input.route.coordinates)) return { ok: false, error: 'route.coordinates must be an array.' };
  for (const coordinate of input.route.coordinates) {
    if (!isCoordinate(coordinate)) return { ok: false, error: 'Every route coordinate must be [lng, lat] inside the corridor.' };
  }
  if (input.event.status !== 'route-tbd' && input.route.coordinates.length < 2) {
    return { ok: false, error: 'Confirmed/updated route packs need at least two route coordinates.' };
  }
  if (!Array.isArray(input.sources) || input.sources.length === 0) {
    return { ok: false, error: 'At least one source is required.' };
  }
  if (!Array.isArray(input.pois)) return { ok: false, error: 'pois must be an array.' };
  for (const poi of input.pois) {
    if (!isRecord(poi)) return { ok: false, error: 'Every POI must be an object.' };
    if (!isNonEmptyString(poi.id) || !isNonEmptyString(poi.kind) || !isNonEmptyString(poi.name)) {
      return { ok: false, error: 'Every POI needs id, kind, and name.' };
    }
    if (!isPointInside(poi.lng, poi.lat)) return { ok: false, error: `POI "${poi.id}" is outside the parade corridor.` };
  }
  if (!Array.isArray(input.closures)) return { ok: false, error: 'closures must be an array.' };
  if (!isRecord(input.transport)) return { ok: false, error: 'transport is required.' };
  if (!Array.isArray(input.meetingLandmarks)) return { ok: false, error: 'meetingLandmarks must be an array.' };
  for (const landmark of input.meetingLandmarks) {
    if (!isRecord(landmark) || !isNonEmptyString(landmark.id) || !isNonEmptyString(landmark.label)) {
      return { ok: false, error: 'Every meeting landmark needs id and label.' };
    }
    if (!isPointInside(landmark.lng, landmark.lat)) {
      return { ok: false, error: `Meeting landmark "${landmark.id}" is outside the parade corridor.` };
    }
  }
  if (!Array.isArray(input.safety)) return { ok: false, error: 'safety must be an array.' };
  if (!Array.isArray(input.scheduleEstimate)) return { ok: false, error: 'scheduleEstimate must be an array.' };
  for (const row of input.scheduleEstimate) {
    if (!isRecord(row)) return { ok: false, error: 'Every schedule row must be an object.' };
    if (row.lng === undefined && row.lat === undefined) continue;
    if (!isPointInside(row.lng, row.lat)) return { ok: false, error: 'Schedule marker coordinates must stay inside the corridor.' };
  }

  return {
    ok: true,
    summary: {
      packVersion: input.packVersion,
      title: input.event.title,
      dateLabel: input.event.dateLabel,
      status: String(input.event.status),
      sourceCount: input.sources.length,
      poiCount: input.pois.length,
      scheduleCount: input.scheduleEstimate.length,
    },
  };
}

function isCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && isPointInside(value[0], value[1]);
}

function isPointInside(rawLng: unknown, rawLat: unknown): boolean {
  const lng = Number(rawLng);
  const lat = Number(rawLat);
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= CORRIDOR_EXTENT.west &&
    lng <= CORRIDOR_EXTENT.east &&
    lat >= CORRIDOR_EXTENT.south &&
    lat <= CORRIDOR_EXTENT.north
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
