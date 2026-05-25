import type { LngLat, RoutePack, RoutePoi } from '../data/parade-2026';
import { bearingDeg, haversineMeters, nearestRouteSegment } from './geo';
import { eventSegmentLabel } from './fan-events';
import { paradeGridCode } from './parade-grid';

export interface ParadeLocationLabel {
  title: string;
  detail: string;
  grid: string;
  short: string;
  distanceToRouteM: number | null;
}

const ANCHOR_KINDS = new Set<RoutePoi['kind']>([
  'station',
  'landmark',
  'medical',
  'exit',
  'meeting',
  'stewards',
  'tube-exit',
  'family',
  'view',
]);

export function describeParadeLocation(point: LngLat, pack: RoutePack): ParadeLocationLabel {
  const nearest = nearestRouteSegment(point, pack.route.coordinates);
  const routeLabel = nearest
    ? segmentLabelForPack(pack, nearest.segmentId, nearest.segmentIndex)
    : 'near route';
  const anchor = nearestAnchor(point, pack.pois);
  const grid = paradeGridCode(point);
  const side = nearest ? sideLabel(point, nearest.snapped, nearest.distanceM) : null;
  const title = anchor && (routeLabel === 'near route' || anchor.distance <= 140) ? anchor.poi.name : routeLabel;
  const detailParts = [
    side,
    anchor && anchor.distance <= 260 ? `near ${anchor.poi.name}` : null,
  ].filter(Boolean);
  const detail = detailParts.length > 0 ? detailParts.join(' · ') : 'offline grid';
  return {
    title,
    detail,
    grid,
    short: `${title} · ${grid}`,
    distanceToRouteM: nearest?.distanceM ?? null,
  };
}

function segmentLabelForPack(pack: RoutePack, segmentId: string, segmentIndex: number): string {
  if (pack.event.title.toLowerCase().includes('islington')) {
    return eventSegmentLabel({ segment_id: segmentId, segment_index: segmentIndex });
  }
  return `${pack.route.label} · stretch ${segmentIndex + 1}`;
}

function nearestAnchor(point: LngLat, pois: readonly RoutePoi[]): { poi: RoutePoi; distance: number } | null {
  const rows = pois
    .filter((poi) => ANCHOR_KINDS.has(poi.kind))
    .map((poi) => ({ poi, distance: haversineMeters(point, poi) }))
    .sort((a, b) => a.distance - b.distance);
  return rows[0] ?? null;
}

function sideLabel(point: LngLat, snapped: LngLat, distanceM: number): string {
  if (distanceM < 18) return 'on route';
  return `${formatDistance(distanceM)} ${cardinalSide(bearingDeg(snapped, point))} side`;
}

function cardinalSide(bearing: number): string {
  if (bearing >= 45 && bearing < 135) return 'east';
  if (bearing >= 135 && bearing < 225) return 'south';
  if (bearing >= 225 && bearing < 315) return 'west';
  return 'north';
}

function formatDistance(meters: number): string {
  if (meters < 100) return `${Math.round(meters)}m`;
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}
