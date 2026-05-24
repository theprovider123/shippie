import { decodeShareFragment, encodeShareFragment } from '@shippie/showcase-kit-v2';
import type { LngLat } from '../data/parade-2026';
import { isInsideExtent, nearestRouteSegment } from './geo';

export const FAN_EVENTS_SHARE_TYPE = 'parade.fan-events.v1';
export const MAX_FAN_EVENTS_FRAGMENT_LENGTH = 3600;
export const ROUTE_SNAP_MAX_ACCURACY_M = 350;

export type FanEventType =
  | 'presence'
  | 'bus_seen'
  | 'crowd_dense'
  | 'road_blocked'
  | 'food_open'
  | 'toilet_queue'
  | 'need_help';
export type FanEventSource = 'local' | 'nearby_sync';

export interface FanEvent extends Record<string, unknown> {
  id: string;
  type: FanEventType;
  source_id: string;
  source: FanEventSource;
  lng: number;
  lat: number;
  accuracy_m: number;
  segment_id: string | null;
  segment_index: number | null;
  snapped_lng: number | null;
  snapped_lat: number | null;
  created_at: string;
  expires_at: string;
}

export interface FanEventPosition extends LngLat {
  accuracyM: number;
}

export interface FanPulseSummary {
  hereCount: number;
  carriedPhones: number;
  totalSignals: number;
  lastSyncAt: string | null;
  latestBus: FanEvent | null;
  activeReports: Array<{ type: FanEventType; count: number; latest: FanEvent; confidence: ReportConfidence }>;
}

export type ReportConfidence = 'single' | 'likely' | 'strong';

export interface FanEventCluster {
  id: string;
  type: FanEventType;
  count: number;
  signalCount: number;
  point: LngLat;
  accuracyM: number;
  segmentId: string | null;
  segmentIndex: number | null;
  latest: FanEvent;
  confidence: ReportConfidence;
}

const EVENT_TTL_MINUTES: Record<FanEventType, number> = {
  presence: 240,
  bus_seen: 120,
  crowd_dense: 45,
  road_blocked: 60,
  food_open: 75,
  toilet_queue: 240,
  need_help: 30,
};

export const FAN_EVENT_LABELS: Record<FanEventType, string> = {
  presence: "I'm here",
  bus_seen: 'Bus seen',
  crowd_dense: 'Too crowded',
  road_blocked: 'Road blocked',
  food_open: 'Food open',
  toilet_queue: 'Toilet here',
  need_help: 'Need help',
};

export const REPORT_EVENT_TYPES: FanEventType[] = [
  'crowd_dense',
  'road_blocked',
  'food_open',
  'toilet_queue',
  'need_help',
];

export function createFanEvent(
  type: FanEventType,
  position: FanEventPosition,
  route: readonly [number, number][],
  sourceId = getFanSourceId(),
): FanEvent {
  const snap = shouldSnapToRoute(type) && position.accuracyM <= ROUTE_SNAP_MAX_ACCURACY_M
    ? nearestRouteSegment(position, route)
    : null;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + EVENT_TTL_MINUTES[type] * 60_000);
  return {
    id: `${type}_${createdAt.getTime().toString(36)}_${randomToken(7)}`,
    type,
    source_id: sourceId,
    source: 'local',
    lng: position.lng,
    lat: position.lat,
    accuracy_m: Math.round(position.accuracyM),
    segment_id: snap?.segmentId ?? null,
    segment_index: snap?.segmentIndex ?? null,
    snapped_lng: snap?.snapped.lng ?? null,
    snapped_lat: snap?.snapped.lat ?? null,
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  };
}

export function summarizeFanEvents(events: FanEvent[], now = Date.now()): FanPulseSummary {
  const active = sortEvents(dedupeFanEvents(events)).filter((event) => isActive(event, now));
  const presence = active.filter((event) => event.type === 'presence');
  const carriedSourceIds = new Set(active.filter((event) => event.source === 'nearby_sync').map((event) => event.source_id));
  const localPresenceSources = new Set(presence.map((event) => event.source_id));
  const latestBus = active.find((event) => event.type === 'bus_seen') ?? null;
  const lastSyncAt = active.find((event) => event.source === 'nearby_sync')?.created_at ?? null;
  const activeReports = REPORT_EVENT_TYPES
    .map((type) => {
      const rows = active.filter((event) => event.type === type);
      const latest = rows[0];
      if (!latest) return null;
      return { type, count: rows.length, latest, confidence: confidenceFor(rows.length) };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  return {
    hereCount: localPresenceSources.size,
    carriedPhones: carriedSourceIds.size,
    totalSignals: active.length,
    lastSyncAt,
    latestBus,
    activeReports,
  };
}

export function dedupeFanEvents(events: FanEvent[]): FanEvent[] {
  const byId = new Map<string, FanEvent>();
  for (const event of events) {
    if (!validateFanEvent(event)) continue;
    const existing = byId.get(event.id);
    if (!existing || Date.parse(event.created_at) > Date.parse(existing.created_at)) byId.set(event.id, event);
  }
  return [...byId.values()];
}

export function sortEvents(events: FanEvent[]): FanEvent[] {
  return [...events].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export function clusterFanEvents(events: FanEvent[], now = Date.now()): FanEventCluster[] {
  const groups = new Map<
    string,
    {
      type: FanEventType;
      events: FanEvent[];
      sources: Set<string>;
      lngSum: number;
      latSum: number;
      accuracyM: number;
      segmentId: string | null;
      segmentIndex: number | null;
    }
  >();

  for (const event of sortEvents(dedupeFanEvents(events))) {
    if (!isActive(event, now)) continue;
    const key = clusterKey(event);
    const point = eventPoint(event);
    const existing = groups.get(key);
    if (existing) {
      existing.events.push(event);
      existing.sources.add(event.source_id);
      existing.lngSum += point.lng;
      existing.latSum += point.lat;
      existing.accuracyM = Math.max(existing.accuracyM, event.accuracy_m);
    } else {
      groups.set(key, {
        type: event.type,
        events: [event],
        sources: new Set([event.source_id]),
        lngSum: point.lng,
        latSum: point.lat,
        accuracyM: event.accuracy_m,
        segmentId: event.segment_id,
        segmentIndex: event.segment_index,
      });
    }
  }

  return [...groups.entries()]
    .map(([id, group]) => {
      const latest = sortEvents(group.events)[0]!;
      const count = group.sources.size;
      return {
        id,
        type: group.type,
        count,
        signalCount: group.events.length,
        point: {
          lng: group.lngSum / group.events.length,
          lat: group.latSum / group.events.length,
        },
        accuracyM: group.accuracyM,
        segmentId: group.segmentId,
        segmentIndex: group.segmentIndex,
        latest,
        confidence: confidenceFor(count),
      };
    })
    .sort((a, b) => {
      const priority = eventPriority(b.type) - eventPriority(a.type);
      if (priority !== 0) return priority;
      const count = b.count - a.count;
      if (count !== 0) return count;
      return Date.parse(b.latest.created_at) - Date.parse(a.latest.created_at);
    });
}

export function isActive(event: FanEvent, now = Date.now()): boolean {
  const expires = Date.parse(event.expires_at);
  return Number.isFinite(expires) && expires > now;
}

export async function encodeFanEventsForSync(events: FanEvent[]): Promise<string> {
  const payload = sortEvents(dedupeFanEvents(events))
    .filter((event) => isActive(event))
    .slice(0, 36)
    .map(compactEvent);
  const fragment = await encodeShareFragment({ type: FAN_EVENTS_SHARE_TYPE, payload });
  if (fragment.length > MAX_FAN_EVENTS_FRAGMENT_LENGTH) {
    throw new Error('Too many fan signals for one reliable sync QR.');
  }
  return fragment;
}

export async function decodeFanEventsSync(fragment: string): Promise<FanEvent[]> {
  if (!fragment || fragment.length > MAX_FAN_EVENTS_FRAGMENT_LENGTH) return [];
  try {
    const decoded = await decodeShareFragment(stripHash(fragment));
    if (!decoded || !decoded.verify.valid || decoded.blob.type !== FAN_EVENTS_SHARE_TYPE) return [];
    const payload = Array.isArray(decoded.blob.payload) ? decoded.blob.payload : [];
    const events: FanEvent[] = [];
    for (const item of payload) {
      const event = expandEvent(item);
      if (event) events.push({ ...event, source: 'nearby_sync' });
    }
    return events;
  } catch {
    return [];
  }
}

export function validateFanEvent(input: unknown): input is FanEvent {
  if (!isRecord(input)) return false;
  if (!isFanEventType(input.type)) return false;
  if (typeof input.id !== 'string' || input.id.length < 4 || input.id.length > 96) return false;
  if (typeof input.source_id !== 'string' || input.source_id.length < 4 || input.source_id.length > 64) return false;
  if (input.source !== 'local' && input.source !== 'nearby_sync') return false;
  const lng = Number(input.lng);
  const lat = Number(input.lat);
  if (!isInsideExtent({ lng, lat })) return false;
  if (!Number.isFinite(Number(input.accuracy_m))) return false;
  if (!validDate(input.created_at) || !validDate(input.expires_at)) return false;
  return true;
}

export function eventAgeLabel(event: Pick<FanEvent, 'created_at'>, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(event.created_at)) / 1000));
  if (!Number.isFinite(seconds)) return 'saved';
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 60 * 60) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

export function eventSegmentLabel(event: Pick<FanEvent, 'segment_id'>): string {
  return event.segment_id ? event.segment_id.replace('seg-', 'stretch ') : 'near route';
}

export function getFanSourceId(): string {
  const key = 'parade-companion:fan-source-id';
  if (typeof localStorage === 'undefined') return `fan_${randomToken(14)}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const next = `fan_${randomToken(14)}`;
  localStorage.setItem(key, next);
  return next;
}

function compactEvent(event: FanEvent): unknown[] {
  return [
    event.id,
    event.type,
    event.source_id,
    Number(event.lng.toFixed(6)),
    Number(event.lat.toFixed(6)),
    Math.round(event.accuracy_m),
    event.segment_id,
    event.segment_index,
    event.snapped_lng === null ? null : Number(event.snapped_lng.toFixed(6)),
    event.snapped_lat === null ? null : Number(event.snapped_lat.toFixed(6)),
    event.created_at,
    event.expires_at,
  ];
}

function expandEvent(input: unknown): FanEvent | null {
  if (!Array.isArray(input) || input.length < 12) return null;
  const event: FanEvent = {
    id: String(input[0] ?? ''),
    type: input[1] as FanEventType,
    source_id: String(input[2] ?? ''),
    source: 'nearby_sync',
    lng: Number(input[3]),
    lat: Number(input[4]),
    accuracy_m: Number(input[5]),
    segment_id: typeof input[6] === 'string' ? input[6] : null,
    segment_index: typeof input[7] === 'number' ? input[7] : null,
    snapped_lng: typeof input[8] === 'number' ? input[8] : null,
    snapped_lat: typeof input[9] === 'number' ? input[9] : null,
    created_at: String(input[10] ?? ''),
    expires_at: String(input[11] ?? ''),
  };
  return validateFanEvent(event) ? event : null;
}

function confidenceFor(count: number): ReportConfidence {
  if (count >= 6) return 'strong';
  if (count >= 3) return 'likely';
  return 'single';
}

function clusterKey(event: FanEvent): string {
  if (event.segment_id) return `${event.type}:${event.segment_id}`;
  const point = eventPoint(event);
  return `${event.type}:grid:${Math.round(point.lng * 2000)}:${Math.round(point.lat * 2000)}`;
}

function eventPoint(event: FanEvent): LngLat {
  return typeof event.snapped_lng === 'number' && typeof event.snapped_lat === 'number'
    ? { lng: event.snapped_lng, lat: event.snapped_lat }
    : { lng: event.lng, lat: event.lat };
}

function eventPriority(type: FanEventType): number {
  if (type === 'need_help') return 6;
  if (type === 'road_blocked') return 5;
  if (type === 'bus_seen') return 4;
  if (type === 'crowd_dense') return 3;
  if (type === 'food_open' || type === 'toilet_queue') return 2;
  return 1;
}

function stripHash(fragment: string): string {
  return fragment.startsWith('#') ? fragment.slice(1) : fragment;
}

function isFanEventType(value: unknown): value is FanEventType {
  return (
    value === 'presence' ||
    value === 'bus_seen' ||
    value === 'crowd_dense' ||
    value === 'road_blocked' ||
    value === 'food_open' ||
    value === 'toilet_queue' ||
    value === 'need_help'
  );
}

function shouldSnapToRoute(type: FanEventType): boolean {
  return type === 'presence' || type === 'bus_seen' || type === 'crowd_dense' || type === 'road_blocked';
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function randomToken(length: number): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}
