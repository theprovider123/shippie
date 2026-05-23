import { CORRIDOR_EXTENT, type LngLat, type MapExtent } from '../data/parade-2026';

const EARTH_RADIUS_M = 6_371_000;
const DEG = Math.PI / 180;

export interface PixelPoint {
  x: number;
  y: number;
}

export function lngLatToPixel(point: LngLat, extent: MapExtent = CORRIDOR_EXTENT): PixelPoint {
  const west = mercatorX(extent.west);
  const east = mercatorX(extent.east);
  const north = mercatorY(extent.north);
  const south = mercatorY(extent.south);
  const x = ((mercatorX(point.lng) - west) / (east - west)) * extent.pxWidth;
  const y = ((mercatorY(point.lat) - north) / (south - north)) * extent.pxHeight;
  return { x, y };
}

export function pixelToLngLat(pixel: PixelPoint, extent: MapExtent = CORRIDOR_EXTENT): LngLat {
  const west = mercatorX(extent.west);
  const east = mercatorX(extent.east);
  const north = mercatorY(extent.north);
  const south = mercatorY(extent.south);
  const x = west + (pixel.x / extent.pxWidth) * (east - west);
  const y = north + (pixel.y / extent.pxHeight) * (south - north);
  return { lng: x * 360 - 180, lat: inverseMercatorY(y) };
}

export function isInsideExtent(point: LngLat, extent: MapExtent = CORRIDOR_EXTENT): boolean {
  return (
    Number.isFinite(point.lng) &&
    Number.isFinite(point.lat) &&
    point.lng >= extent.west &&
    point.lng <= extent.east &&
    point.lat >= extent.south &&
    point.lat <= extent.north
  );
}

export function haversineMeters(a: LngLat, b: LngLat): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(from: LngLat, to: LngLat): number {
  const lat1 = from.lat * DEG;
  const lat2 = to.lat * DEG;
  const dLng = (to.lng - from.lng) * DEG;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return normalizeDegrees((Math.atan2(y, x) / DEG + 360) % 360);
}

export function metersToPixelRadius(point: LngLat, meters: number, extent: MapExtent = CORRIDOR_EXTENT): number {
  if (meters <= 0) return 0;
  const lngDelta = meters / (111_320 * Math.cos(point.lat * DEG));
  const here = lngLatToPixel(point, extent);
  const east = lngLatToPixel({ lng: point.lng + lngDelta, lat: point.lat }, extent);
  return Math.abs(east.x - here.x);
}

export interface NearestSegment {
  segmentId: string;
  segmentIndex: number;
  distanceM: number;
  snapped: LngLat;
  t: number;
}

export function nearestRouteSegment(point: LngLat, route: readonly [number, number][]): NearestSegment | null {
  if (route.length < 2) return null;
  let best: NearestSegment | null = null;
  for (let i = 0; i < route.length - 1; i += 1) {
    const aTuple = route[i];
    const bTuple = route[i + 1];
    if (!aTuple || !bTuple) continue;
    const a = { lng: aTuple[0], lat: aTuple[1] };
    const b = { lng: bTuple[0], lat: bTuple[1] };
    const projected = projectToSegment(point, a, b);
    const distanceM = haversineMeters(point, projected.snapped);
    if (!best || distanceM < best.distanceM) {
      best = {
        segmentId: `seg-${i}`,
        segmentIndex: i,
        distanceM,
        snapped: projected.snapped,
        t: projected.t,
      };
    }
  }
  return best;
}

export function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function mercatorX(lng: number): number {
  return (lng + 180) / 360;
}

function mercatorY(lat: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = clamped * DEG;
  return (1 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / Math.PI) / 2;
}

function inverseMercatorY(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) / DEG);
}

function projectToSegment(point: LngLat, a: LngLat, b: LngLat): { snapped: LngLat; t: number } {
  const originLat = ((point.lat + a.lat + b.lat) / 3) * DEG;
  const p = toMeters(point, originLat);
  const pa = toMeters(a, originLat);
  const pb = toMeters(b, originLat);
  const vx = pb.x - pa.x;
  const vy = pb.y - pa.y;
  const lenSq = vx * vx + vy * vy;
  const rawT = lenSq === 0 ? 0 : ((p.x - pa.x) * vx + (p.y - pa.y) * vy) / lenSq;
  const t = Math.max(0, Math.min(1, rawT));
  return {
    t,
    snapped: {
      lng: a.lng + (b.lng - a.lng) * t,
      lat: a.lat + (b.lat - a.lat) * t,
    },
  };
}

function toMeters(point: LngLat, originLatRad: number): PixelPoint {
  return {
    x: point.lng * DEG * EARTH_RADIUS_M * Math.cos(originLatRad),
    y: point.lat * DEG * EARTH_RADIUS_M,
  };
}
