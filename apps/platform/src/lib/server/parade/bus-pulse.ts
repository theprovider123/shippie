const EVENT_ID = 'parade:2026-05-31';
const FRESH_WINDOW_MS = 8 * 60_000;
const PASSED_WINDOW_MS = 16 * 60_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 3;
const MAX_STORED_SIGHTINGS = 200;

export const BUS_PULSE_EVENT_ID = EVENT_ID;

export type BusPulseKind = 'here';
export type BusPulseConfidence = 'none' | 'possible' | 'confirmed' | 'passed';

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

export function busPulseObjectName(segmentId: string): string {
  return `${EVENT_ID}:${segmentId}`;
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

export class BusPulseSegment {
  private readonly rate = new Map<string, RateBucket>();

  constructor(private readonly state: DurableObjectStateLite, _env: unknown) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const segmentId = url.searchParams.get('segment') ?? 'unknown';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
