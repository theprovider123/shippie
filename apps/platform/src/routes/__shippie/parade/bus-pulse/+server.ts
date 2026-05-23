import type { RequestHandler } from './$types';
import {
  busPulseObjectName,
  isValidSegmentId,
  validateBusPulsePacket,
  type BusPulseAggregate,
} from '$lib/server/parade/bus-pulse';

interface BusPulseNamespace {
  idFromName(name: string): { toString(): string };
  get(id: { toString(): string }): { fetch: (request: Request) => Promise<Response> };
}

interface BusPulseEnv {
  BUS_PULSE?: BusPulseNamespace;
}

export const GET: RequestHandler = async ({ url, platform }) => {
  const env = (platform?.env ?? {}) as BusPulseEnv;
  if (!env.BUS_PULSE) {
    return Response.json({ error: 'bus_pulse_unavailable', aggregates: [] }, { status: 503 });
  }

  const segments = parseSegments(url.searchParams.get('segments'));
  if (segments.length === 0) {
    return Response.json({ error: 'invalid_segments' }, { status: 400 });
  }

  const aggregates: BusPulseAggregate[] = [];
  for (const segmentId of segments) {
    const id = env.BUS_PULSE.idFromName(busPulseObjectName(segmentId));
    const stub = env.BUS_PULSE.get(id);
    const res = await stub.fetch(new Request(`https://bus-pulse.local/?segment=${encodeURIComponent(segmentId)}`));
    if (!res.ok) continue;
    const body = (await res.json()) as { aggregate?: BusPulseAggregate };
    if (body.aggregate) aggregates.push(body.aggregate);
  }

  return Response.json(
    { eventId: 'parade:2026-05-31', aggregates },
    { headers: { 'cache-control': 'public, max-age=5' } },
  );
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const env = (platform?.env ?? {}) as BusPulseEnv;
  if (!env.BUS_PULSE) {
    return Response.json({ error: 'bus_pulse_unavailable' }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = validateBusPulsePacket(raw);
  if (!parsed.ok) return Response.json({ error: parsed.reason }, { status: 400 });

  const id = env.BUS_PULSE.idFromName(busPulseObjectName(parsed.packet.segmentId));
  const stub = env.BUS_PULSE.get(id);
  return await stub.fetch(
    new Request(`https://bus-pulse.local/?segment=${encodeURIComponent(parsed.packet.segmentId)}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': request.headers.get('cf-connecting-ip') ?? '',
        'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '',
      },
      body: JSON.stringify(raw),
    }),
  );
};

function parseSegments(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const item of raw.split(',')) {
    const segmentId = item.trim();
    if (!isValidSegmentId(segmentId)) continue;
    seen.add(segmentId);
    if (seen.size >= 32) break;
  }
  return [...seen];
}
