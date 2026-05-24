const EVENT_ID = 'parade:2026-05-31';
const FRESH_WINDOW_MS = 8 * 60_000;
const PASSED_WINDOW_MS = 16 * 60_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 3;
const MAX_STORED_SIGHTINGS = 200;
const MAX_STORED_FAN_SIGNALS = 320;
const MAX_RETURNED_FAN_SIGNALS = 80;
const FAN_SIGNAL_WINDOW_MS = 4 * 60 * 60_000;
const CORRIDOR_EXTENT = {
  west: -0.125,
  east: -0.085,
  south: 51.531,
  north: 51.566,
};

export const BUS_PULSE_EVENT_ID = EVENT_ID;

export type BusPulseKind = 'here';
export type BusPulseConfidence = 'none' | 'possible' | 'confirmed' | 'passed';
export type FanPulseType =
  | 'presence'
  | 'bus_seen'
  | 'crowd_dense'
  | 'road_blocked'
  | 'food_open'
  | 'toilet_queue';

export interface BusPulsePacket {
  segmentId: string;
  kind: BusPulseKind;
  accuracyM: number;
  createdAt: string;
}

export interface NormalizedBusPulsePacket {
  segmentId: string;
  kind: BusPulseKind;
  accuracyM: number;
  createdAtMs: number;
}

export interface StoredBusPulseSighting {
  kind: BusPulseKind;
  accuracyM: number;
  createdAtMs: number;
  receivedAtMs: number;
}

export interface FanPulsePacket {
  id: string;
  type: FanPulseType;
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

export interface NormalizedFanPulsePacket {
  id: string;
  type: FanPulseType;
  sourceId: string;
  lng: number;
  lat: number;
  accuracyM: number;
  segmentId: string;
  eventSegmentId: string | null;
  eventSegmentIndex: number | null;
  snappedLng: number | null;
  snappedLat: number | null;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface StoredFanPulseSignal {
  id: string;
  type: FanPulseType;
  sourceId: string;
  lng: number;
  lat: number;
  accuracyM: number;
  eventSegmentId: string | null;
  eventSegmentIndex: number | null;
  snappedLng: number | null;
  snappedLat: number | null;
  createdAtMs: number;
  expiresAtMs: number;
  receivedAtMs: number;
}

export interface BusPulseAggregate {
  segmentId: string;
  confidence: BusPulseConfidence;
  count: number;
  latestAt: string | null;
  ageSeconds: number | null;
  source: 'crowd-pulse';
  windowSeconds: number;
}

interface DurableObjectStorageLite {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

interface DurableObjectStateLite {
  storage: DurableObjectStorageLite;
}

interface RateBucket {
  startedAt: number;
  count: number;
}

type ValidationResult =
  | { ok: true; packet: NormalizedBusPulsePacket }
  | { ok: false; reason: string };

type FanPulseValidationResult =
  | { ok: true; packet: NormalizedFanPulsePacket }
  | { ok: false; reason: string };

export function busPulseObjectName(segmentId: string): string {
  return `${EVENT_ID}:${segmentId}`;
}

export function fanPulseObjectName(segmentId: string): string {
  return `${EVENT_ID}:fan:${segmentId}`;
}

export function isValidSegmentId(segmentId: string): boolean {
  return /^seg-\d{1,3}$/.test(segmentId);
}

export function validateBusPulsePacket(input: unknown, nowMs = Date.now()): ValidationResult {
  if (!isRecord(input)) return { ok: false, reason: 'packet_not_object' };

  const keys = Object.keys(input).sort();
  const allowed = ['accuracyM', 'createdAt', 'kind', 'segmentId'];
  if (keys.length !== allowed.length || keys.some((key, index) => key !== allowed[index])) {
    return { ok: false, reason: 'unexpected_fields' };
  }

  if (typeof input.segmentId !== 'string' || !isValidSegmentId(input.segmentId)) {
    return { ok: false, reason: 'invalid_segment' };
  }
  if (input.kind !== 'here') return { ok: false, reason: 'invalid_kind' };

  const accuracyM = Number(input.accuracyM);
  if (!Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > 5000) {
    return { ok: false, reason: 'invalid_accuracy' };
  }

  if (typeof input.createdAt !== 'string') return { ok: false, reason: 'invalid_created_at' };
  const createdAtMs = Date.parse(input.createdAt);
  if (!Number.isFinite(createdAtMs)) return { ok: false, reason: 'invalid_created_at' };
  if (createdAtMs > nowMs + 2 * 60_000) return { ok: false, reason: 'created_at_future' };
  if (createdAtMs < nowMs - PASSED_WINDOW_MS) return { ok: false, reason: 'created_at_stale' };

  return {
    ok: true,
    packet: {
      segmentId: input.segmentId,
      kind: input.kind,
      accuracyM: Math.round(accuracyM),
      createdAtMs,
    },
  };
}

export function validateFanPulsePacket(input: unknown, nowMs = Date.now()): FanPulseValidationResult {
  if (!isRecord(input)) return { ok: false, reason: 'packet_not_object' };

  const keys = Object.keys(input).sort();
  const allowed = [
    'accuracyM',
    'createdAt',
    'eventSegmentId',
    'eventSegmentIndex',
    'expiresAt',
    'id',
    'lat',
    'lng',
    'segmentId',
    'snappedLat',
    'snappedLng',
    'sourceId',
    'type',
  ];
  if (keys.length !== allowed.length || keys.some((key, index) => key !== allowed[index])) {
    return { ok: false, reason: 'unexpected_fields' };
  }

  if (typeof input.id !== 'string' || input.id.length < 4 || input.id.length > 96) {
    return { ok: false, reason: 'invalid_id' };
  }
  if (!isFanPulseType(input.type)) return { ok: false, reason: 'invalid_type' };
  if (typeof input.sourceId !== 'string' || input.sourceId.length < 4 || input.sourceId.length > 64) {
    return { ok: false, reason: 'invalid_source' };
  }
  if (typeof input.segmentId !== 'string' || !isValidSegmentId(input.segmentId)) {
    return { ok: false, reason: 'invalid_segment' };
  }

  const lng = Number(input.lng);
  const lat = Number(input.lat);
  if (!isPointInside(lng, lat)) return { ok: false, reason: 'outside_corridor' };

  const accuracyM = Number(input.accuracyM);
  if (!Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > 5000) {
    return { ok: false, reason: 'invalid_accuracy' };
  }

  const eventSegmentId = input.eventSegmentId === null ? null : String(input.eventSegmentId);
  if (eventSegmentId !== null && !isValidSegmentId(eventSegmentId)) {
    return { ok: false, reason: 'invalid_event_segment' };
  }
  const eventSegmentIndex = input.eventSegmentIndex === null ? null : Number(input.eventSegmentIndex);
  if (eventSegmentIndex !== null && (!Number.isInteger(eventSegmentIndex) || eventSegmentIndex < 0 || eventSegmentIndex > 999)) {
    return { ok: false, reason: 'invalid_event_segment_index' };
  }

  const snappedLng = input.snappedLng === null ? null : Number(input.snappedLng);
  const snappedLat = input.snappedLat === null ? null : Number(input.snappedLat);
  if ((snappedLng === null) !== (snappedLat === null)) return { ok: false, reason: 'invalid_snap' };
  if (snappedLng !== null && !isPointInside(snappedLng, snappedLat as number)) {
    return { ok: false, reason: 'invalid_snap' };
  }

  if (typeof input.createdAt !== 'string' || typeof input.expiresAt !== 'string') {
    return { ok: false, reason: 'invalid_dates' };
  }
  const createdAtMs = Date.parse(input.createdAt);
  const expiresAtMs = Date.parse(input.expiresAt);
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(expiresAtMs)) {
    return { ok: false, reason: 'invalid_dates' };
  }
  if (createdAtMs > nowMs + 2 * 60_000) return { ok: false, reason: 'created_at_future' };
  if (expiresAtMs <= nowMs) return { ok: false, reason: 'expired' };
  if (expiresAtMs - createdAtMs > FAN_SIGNAL_WINDOW_MS) return { ok: false, reason: 'ttl_too_long' };

  return {
    ok: true,
    packet: {
      id: input.id,
      type: input.type,
      sourceId: input.sourceId,
      lng: Number(lng.toFixed(6)),
      lat: Number(lat.toFixed(6)),
      accuracyM: Math.round(accuracyM),
      segmentId: input.segmentId,
      eventSegmentId,
      eventSegmentIndex,
      snappedLng: snappedLng === null ? null : Number(snappedLng.toFixed(6)),
      snappedLat: snappedLat === null ? null : Number((snappedLat as number).toFixed(6)),
      createdAtMs,
      expiresAtMs,
    },
  };
}

export function summarizeBusPulse(
  segmentId: string,
  sightings: readonly StoredBusPulseSighting[],
  nowMs = Date.now(),
): BusPulseAggregate {
  const retained = pruneSightings(sightings, nowMs);
  const fresh = retained.filter((sighting) => nowMs - sighting.createdAtMs <= FRESH_WINDOW_MS);
  const latest = retained.reduce<StoredBusPulseSighting | null>((best, sighting) => {
    if (!best || sighting.createdAtMs > best.createdAtMs) return sighting;
    return best;
  }, null);

  let confidence: BusPulseConfidence = 'none';
  if (fresh.length >= 3) confidence = 'confirmed';
  else if (fresh.length > 0) confidence = 'possible';
  else if (latest) confidence = 'passed';

  return {
    segmentId,
    confidence,
    count: fresh.length,
    latestAt: latest ? new Date(latest.createdAtMs).toISOString() : null,
    ageSeconds: latest ? Math.max(0, Math.round((nowMs - latest.createdAtMs) / 1000)) : null,
    source: 'crowd-pulse',
    windowSeconds: Math.round(FRESH_WINDOW_MS / 1000),
  };
}

export function pruneSightings(
  sightings: readonly StoredBusPulseSighting[],
  nowMs = Date.now(),
): StoredBusPulseSighting[] {
  return sightings
    .filter((sighting) => nowMs - sighting.createdAtMs <= PASSED_WINDOW_MS)
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, MAX_STORED_SIGHTINGS);
}

export function pruneFanSignals(
  signals: readonly StoredFanPulseSignal[],
  nowMs = Date.now(),
): StoredFanPulseSignal[] {
  const byId = new Map<string, StoredFanPulseSignal>();
  for (const signal of signals) {
    if (signal.expiresAtMs <= nowMs) continue;
    if (nowMs - signal.createdAtMs > FAN_SIGNAL_WINDOW_MS) continue;
    const existing = byId.get(signal.id);
    if (!existing || signal.receivedAtMs > existing.receivedAtMs) byId.set(signal.id, signal);
  }
  return [...byId.values()]
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, MAX_STORED_FAN_SIGNALS);
}

export class BusPulseSegment {
  private readonly rate = new Map<string, RateBucket>();

  constructor(private readonly state: DurableObjectStateLite, _env: unknown) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const segmentId = url.searchParams.get('segment') ?? 'unknown';

    if (url.pathname === '/fan') {
      return this.handleFanPulse(request, segmentId);
    }

    if (request.method === 'GET') {
      return this.aggregateResponse(segmentId);
    }

    if (request.method !== 'POST') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    }

    const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? 'unknown';
    const nowMs = Date.now();
    if (!this.allowIp(ip, nowMs)) {
      return Response.json({ error: 'rate_limited' }, { status: 429 });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return Response.json({ error: 'invalid_json' }, { status: 400 });
    }

    const parsed = validateBusPulsePacket(raw, nowMs);
    if (!parsed.ok) {
      return Response.json({ error: parsed.reason }, { status: 400 });
    }
    if (parsed.packet.segmentId !== segmentId) {
      return Response.json({ error: 'segment_mismatch' }, { status: 400 });
    }

    const sightings = await this.loadSightings(nowMs);
    sightings.unshift({
      kind: parsed.packet.kind,
      accuracyM: parsed.packet.accuracyM,
      createdAtMs: parsed.packet.createdAtMs,
      receivedAtMs: nowMs,
    });
    const retained = pruneSightings(sightings, nowMs);
    await this.state.storage.put('sightings', retained);

    return Response.json(
      { ok: true, aggregate: summarizeBusPulse(segmentId, retained, nowMs) },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  private async handleFanPulse(request: Request, segmentId: string): Promise<Response> {
    if (!isValidSegmentId(segmentId)) {
      return Response.json({ error: 'invalid_segment' }, { status: 400 });
    }

    if (request.method === 'GET') {
      const signals = await this.loadFanSignals(Date.now());
      return Response.json(
        {
          segmentId,
          signals: signals.slice(0, MAX_RETURNED_FAN_SIGNALS).map((signal) => storedFanSignalToPacket(signal, segmentId)),
        },
        { headers: { 'cache-control': 'public, max-age=5' } },
      );
    }

    if (request.method !== 'POST') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    }

    const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? 'unknown';
    const nowMs = Date.now();
    if (!this.allowIp(`fan:${ip}`, nowMs)) {
      return Response.json({ error: 'rate_limited' }, { status: 429 });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return Response.json({ error: 'invalid_json' }, { status: 400 });
    }

    const parsed = validateFanPulsePacket(raw, nowMs);
    if (!parsed.ok) return Response.json({ error: parsed.reason }, { status: 400 });
    if (parsed.packet.segmentId !== segmentId) {
      return Response.json({ error: 'segment_mismatch' }, { status: 400 });
    }

    const signals = await this.loadFanSignals(nowMs);
    signals.unshift({
      id: parsed.packet.id,
      type: parsed.packet.type,
      sourceId: parsed.packet.sourceId,
      lng: parsed.packet.lng,
      lat: parsed.packet.lat,
      accuracyM: parsed.packet.accuracyM,
      eventSegmentId: parsed.packet.eventSegmentId,
      eventSegmentIndex: parsed.packet.eventSegmentIndex,
      snappedLng: parsed.packet.snappedLng,
      snappedLat: parsed.packet.snappedLat,
      createdAtMs: parsed.packet.createdAtMs,
      expiresAtMs: parsed.packet.expiresAtMs,
      receivedAtMs: nowMs,
    });
    const retained = pruneFanSignals(signals, nowMs);
    await this.state.storage.put('fanSignals', retained);

    return Response.json(
      { ok: true, segmentId, accepted: 1 },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  private async aggregateResponse(segmentId: string): Promise<Response> {
    const nowMs = Date.now();
    const retained = await this.loadSightings(nowMs);
    return Response.json(
      { aggregate: summarizeBusPulse(segmentId, retained, nowMs) },
      { headers: { 'cache-control': 'public, max-age=5' } },
    );
  }

  private async loadSightings(nowMs: number): Promise<StoredBusPulseSighting[]> {
    const rows = (await this.state.storage.get<StoredBusPulseSighting[]>('sightings')) ?? [];
    return pruneSightings(Array.isArray(rows) ? rows : [], nowMs);
  }

  private async loadFanSignals(nowMs: number): Promise<StoredFanPulseSignal[]> {
    const rows = (await this.state.storage.get<StoredFanPulseSignal[]>('fanSignals')) ?? [];
    return pruneFanSignals(Array.isArray(rows) ? rows : [], nowMs);
  }

  private allowIp(ip: string, nowMs: number): boolean {
    const bucket = this.rate.get(ip);
    if (!bucket || nowMs - bucket.startedAt > RATE_WINDOW_MS) {
      this.rate.set(ip, { startedAt: nowMs, count: 1 });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= RATE_LIMIT;
  }
}

function storedFanSignalToPacket(signal: StoredFanPulseSignal, segmentId: string): FanPulsePacket {
  return {
    id: signal.id,
    type: signal.type,
    sourceId: signal.sourceId,
    lng: signal.lng,
    lat: signal.lat,
    accuracyM: signal.accuracyM,
    segmentId,
    eventSegmentId: signal.eventSegmentId,
    eventSegmentIndex: signal.eventSegmentIndex,
    snappedLng: signal.snappedLng,
    snappedLat: signal.snappedLat,
    createdAt: new Date(signal.createdAtMs).toISOString(),
    expiresAt: new Date(signal.expiresAtMs).toISOString(),
  };
}

function isFanPulseType(value: unknown): value is FanPulseType {
  return (
    value === 'presence' ||
    value === 'bus_seen' ||
    value === 'crowd_dense' ||
    value === 'road_blocked' ||
    value === 'food_open' ||
    value === 'toilet_queue'
  );
}

function isPointInside(lng: number, lat: number): boolean {
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
