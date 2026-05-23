import type { LngLat } from '../data/parade-2026';
import { nearestRouteSegment } from './geo';
import { listBusMarkers, saveBusMarker } from './shippie-db';

export type BusMarkerKind = 'here';

export interface BusMarker extends Record<string, unknown> {
  id: string;
  kind: BusMarkerKind;
  lng: number;
  lat: number;
  accuracy_m: number;
  created_at: string;
  segment_id: string | null;
  segment_index: number | null;
  snapped_lng: number | null;
  snapped_lat: number | null;
  source: 'local';
}

export interface SightingPosition extends LngLat {
  accuracyM: number;
}

export async function recordSighting(
  kind: BusMarkerKind,
  position: SightingPosition,
  route: readonly [number, number][],
): Promise<BusMarker> {
  const snap = nearestRouteSegment(position, route);
  const marker: BusMarker = {
    id: `bus_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    kind,
    lng: position.lng,
    lat: position.lat,
    accuracy_m: Math.round(position.accuracyM),
    created_at: new Date().toISOString(),
    segment_id: snap?.segmentId ?? null,
    segment_index: snap?.segmentIndex ?? null,
    snapped_lng: snap?.snapped.lng ?? null,
    snapped_lat: snap?.snapped.lat ?? null,
    source: 'local',
  };
  await saveBusMarker(marker);
  return marker;
}

export async function listSightings(): Promise<BusMarker[]> {
  return listBusMarkers();
}

export function formatMarkerTime(marker: BusMarker): string {
  const date = new Date(marker.created_at);
  if (Number.isNaN(date.getTime())) return 'saved';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  }).format(date);
}
