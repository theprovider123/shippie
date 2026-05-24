import type { LngLat } from '../data/parade-2026';
import { type FanEvent, type FanEventType, validateFanEvent } from './fan-events';
import { nearestRouteSegment } from './geo';

export const FAN_PULSE_ENDPOINT = '/__shippie/parade/fan-pulse';
const FETCH_TIMEOUT_MS = 5_000;
const MAX_PULL_SEGMENTS = 32;
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
  return event.source === 'local' && PUBLISHABLE_TYPES.includes(event.type);
}

export function routeSegmentIds(route: readonly [number, number][]): string[] {
  return route.slice(0, -1).map((_, index) => `seg-${index}`);
}

export function fanEventToPulsePacket(event: FanEvent, route: readonly [number, number][]): LiveFanPulsePacket | null {
  if (!isPublishableFanEvent(event)) return null;
  const relaySegmentId = event.segment_id ?? nearestRouteSegment(event, route)?.segmentId ?? null;
  if (!relaySegmentId) return null;
  return {
    id: event.id,
    type: event.type as Exclude<FanEventType, 'need_help'>,
    sourceId: event.source_id,
    lng: Number(event.lng.toFixed(6)),
    lat: Number(event.lat.toFixed(6)),
    accuracyM: Math.round(event.accuracy_m),
    segmentId: relaySegmentId,
    eventSegmentId: event.segment_id,
    eventSegmentIndex: event.segment_index,
    snappedLng: event.snapped_lng === null ? null : Number(event.snapped_lng.toFixed(6)),
    snappedLat: event.snapped_lat === null ? null : Number(event.snapped_lat.toFixed(6)),
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
  const packets = events
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
  const active = events
    .filter((event) => Date.parse(event.expires_at) > now)
    .filter((event) => event.type === 'bus_seen' || event.type === 'toilet_queue' || event.type === 'crowd_dense' || event.type === 'road_blocked')
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const seen = new Set<FanEventType>();
  const out: Array<{ event: FanEvent; point: LngLat }> = [];
  for (const event of active) {
    if (seen.has(event.type)) continue;
    seen.add(event.type);
    out.push({
      event,
      point:
        typeof event.snapped_lng === 'number' && typeof event.snapped_lat === 'number'
          ? { lng: event.snapped_lng, lat: event.snapped_lat }
          : { lng: event.lng, lat: event.lat },
    });
    if (out.length >= 3) break;
  }
  return out;
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
