import { CORRIDOR_EXTENT, FALLBACK_ROUTE_PACK, type RoutePack } from '../data/parade-2026';
import { isInsideExtent } from './geo';
import bakedRoutePack from '../../public/route-pack.json';

export function loadRoutePack(): RoutePack {
  return validateRoutePack(bakedRoutePack) ?? validateRoutePack(FALLBACK_ROUTE_PACK) ?? FALLBACK_ROUTE_PACK;
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
