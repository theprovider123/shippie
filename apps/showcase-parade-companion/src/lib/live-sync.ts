import type { LngLat } from '../data/parade-2026';
import { clusterFanEvents, isActive, type FanEvent, type FanEventType, type ReportConfidence, validateFanEvent } from './fan-events';
import { nearestRouteSegment } from './geo';

export const FAN_PULSE_ENDPOINT = '/__shippie/parade/fan-pulse';
const FETCH_TIMEOUT_MS = 5_000;
const MAX_PULL_SEGMENTS = 32;
const MAX_PUBLISH_PER_SYNC = 8;
const PUBLIC_COORD_DECIMALS = 4;
const PUBLISHABLE_TYPES: FanEventType[] = [
  'presence',
  'bus_seen',
  'crowd_dense',
  'road_blocked',
  'food_open',
  'toilet_queue',
];

export interface LiveSyncStatus {
  state: 'offline' | 'idle' | 'syncing' | 'synced' | 'failed';
  lastSyncAt: string | null;
  received: number;
  published: number;
}

export interface LiveFanPulsePacket {
  id: string;
  type: Exclude<FanEventType, 'need_help'>;
  sourceId: string;
  lng: number;
  lat: number;
  accuracyM: number;
  segmentId: string;
  eventSegmentId: string | null;
  eventSegmentIndex: number | null;
  snappedLng: number | null;
  snappedLat: number | null;
  createdAt: string;
  expiresAt: string;
}

export interface LiveFanPulseResponse {
  eventId?: string;
  segments?: Array<{ segmentId: string; signals?: LiveFanPulsePacket[] }>;
}

export function isPublishableFanEvent(event: FanEvent): boolean {
  return event.source === 'local' && isActive(event) && PUBLISHABLE_TYPES.includes(event.type);
}

export function routeSegmentIds(route: readonly [number, number][]): string[] {
  return route.slice(0, -1).map((_, index) => `seg-${index}`);
}

export function selectFanPulseEvents(events: readonly FanEvent[], limit = MAX_PUBLISH_PER_SYNC): FanEvent[] {
  const byKey = new Map<string, FanEvent>();
  for (const event of events) {
    if (!isPublishableFanEvent(event)) continue;
    const key = `${event.type}:${event.segment_id ?? quantizedGridKey(event)}:${event.source_id}`;
    const current = byKey.get(key);
    if (!current || Date.parse(event.created_at) > Date.parse(current.created_at)) byKey.set(key, event);
  }
  return [...byKey.values()]
    .sort((a, b) => {
      const priority = publishPriority(b.type) - publishPriority(a.type);
      if (priority !== 0) return priority;
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    })
    .slice(0, limit);
}

export function fanEventToPulsePacket(event: FanEvent, route: readonly [number, number][]): LiveFanPulsePacket | null {
  if (!isPublishableFanEvent(event)) return null;
  const relaySegmentId = event.segment_id ?? nearestRouteSegment(event, route)?.segmentId ?? null;
  if (!relaySegmentId) return null;
  const publicPoint = publicPulsePoint(event);
  return {
    id: event.id,
    type: event.type as Exclude<FanEventType, 'need_help'>,
    sourceId: event.source_id,
    lng: publicPoint.lng,
    lat: publicPoint.lat,
    accuracyM: publicPoint.accuracyM,
    segmentId: relaySegmentId,
    eventSegmentId: event.segment_id,
    eventSegmentIndex: event.segment_index,
    snappedLng: publicPoint.snappedLng,
    snappedLat: publicPoint.snappedLat,
    createdAt: event.created_at,
    expiresAt: event.expires_at,
  };
}

export function pulsePacketToFanEvent(packet: LiveFanPulsePacket): FanEvent | null {
  const event: FanEvent = {
    id: packet.id,
    type: packet.type,
    source_id: packet.sourceId,
    source: 'relay',
    lng: Number(packet.lng),
    lat: Number(packet.lat),
    accuracy_m: Number(packet.accuracyM),
    segment_id: packet.eventSegmentId,
    segment_index: packet.eventSegmentIndex,
    snapped_lng: packet.snappedLng,
    snapped_lat: packet.snappedLat,
    created_at: packet.createdAt,
    expires_at: packet.expiresAt,
  };
  return validateFanEvent(event) ? event : null;
}

export async function publishFanPulse(
  events: readonly FanEvent[],
  route: readonly [number, number][],
  endpoint = FAN_PULSE_ENDPOINT,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  if (events.length === 0) return 0;
  let published = 0;
  const packets = selectFanPulseEvents(events)
    .map((event) => fanEventToPulsePacket(event, route))
    .filter((packet): packet is LiveFanPulsePacket => Boolean(packet));

  for (const packet of packets) {
    try {
      const response = await fetchWithTimeout(fetchImpl, endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(packet),
      });
      if (response.ok || response.status === 429) published += response.ok ? 1 : 0;
    } catch {
      // Opportunistic sync: local data already exists, so failures stay quiet.
    }
  }
  return published;
}

export async function pullFanPulse(
  route: readonly [number, number][],
  endpoint = FAN_PULSE_ENDPOINT,
  fetchImpl: typeof fetch = fetch,
): Promise<FanEvent[]> {
  const segments = routeSegmentIds(route).slice(0, MAX_PULL_SEGMENTS);
  if (segments.length === 0) return [];
  const url = `${endpoint}?segments=${encodeURIComponent(segments.join(','))}`;
  const response = await fetchWithTimeout(fetchImpl, url, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`fan_pulse_${response.status}`);
  const body = (await response.json()) as LiveFanPulseResponse;
  const events: FanEvent[] = [];
  for (const segment of body.segments ?? []) {
    for (const packet of segment.signals ?? []) {
      const event = pulsePacketToFanEvent(packet);
      if (event) events.push(event);
    }
  }
  return events;
}

export function crowdCompassTargets(events: readonly FanEvent[], here: LngLat | null, now = Date.now()) {
  if (!here) return [];
  const active = clusterFanEvents([...events], now)
    .filter((cluster) => cluster.type === 'bus_seen' || cluster.type === 'toilet_queue' || cluster.type === 'crowd_dense' || cluster.type === 'road_blocked')
    .sort((a, b) => {
      const count = b.count - a.count;
      if (count !== 0) return count;
      return Date.parse(b.latest.created_at) - Date.parse(a.latest.created_at);
    });
  const seen = new Set<FanEventType>();
  const out: Array<{ event: FanEvent; point: LngLat; count: number; confidence: ReportConfidence }> = [];
  for (const cluster of active) {
    if (seen.has(cluster.type)) continue;
    seen.add(cluster.type);
    out.push({
      event: cluster.latest,
      point: cluster.point,
      count: cluster.count,
      confidence: cluster.confidence,
    });
    if (out.length >= 3) break;
  }
  return out;
}

function publicPulsePoint(event: FanEvent): {
  lng: number;
  lat: number;
  accuracyM: number;
  snappedLng: number | null;
  snappedLat: number | null;
} {
  const snapped = typeof event.snapped_lng === 'number' && typeof event.snapped_lat === 'number'
    ? {
        lng: quantizeCoord(event.snapped_lng),
        lat: quantizeCoord(event.snapped_lat),
      }
    : null;
  const lng = snapped?.lng ?? quantizeCoord(event.lng);
  const lat = snapped?.lat ?? quantizeCoord(event.lat);
  return {
    lng,
    lat,
    accuracyM: Math.max(20, Math.round(event.accuracy_m)),
    snappedLng: snapped?.lng ?? null,
    snappedLat: snapped?.lat ?? null,
  };
}

function quantizeCoord(value: number): number {
  return Number(value.toFixed(PUBLIC_COORD_DECIMALS));
}

function quantizedGridKey(point: LngLat): string {
  return `${quantizeCoord(point.lng)}:${quantizeCoord(point.lat)}`;
}

function publishPriority(type: FanEventType): number {
  if (type === 'bus_seen') return 6;
  if (type === 'road_blocked') return 5;
  if (type === 'toilet_queue') return 4;
  if (type === 'crowd_dense') return 3;
  if (type === 'food_open') return 2;
  if (type === 'presence') return 1;
  return 0;
}

async function fetchWithTimeout(fetchImpl: typeof fetch, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
