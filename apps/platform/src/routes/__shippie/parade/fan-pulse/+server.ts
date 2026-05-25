import type { RequestHandler } from './$types';
import {
  fanPulseObjectName,
  isValidSegmentId,
  validateFanPulsePacket,
  type FanPulsePacket,
} from '$lib/server/parade/bus-pulse';

interface FanPulseNamespace {
  idFromName(name: string): { toString(): string };
  get(id: { toString(): string }): { fetch: (input: string, init?: RequestInit) => Promise<Response> };
}

interface FanPulseEnv {
  BUS_PULSE?: FanPulseNamespace;
}

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export const GET: RequestHandler = async ({ url, platform }) => {
  const env = (platform?.env ?? {}) as FanPulseEnv;
  if (!env.BUS_PULSE) {
    return Response.json({ error: 'fan_pulse_unavailable', segments: [] }, { status: 503 });
  }

  const segments = parseSegments(url.searchParams.get('segments'));
  if (segments.length === 0) {
    return Response.json({ error: 'invalid_segments' }, { status: 400 });
  }

  const cache = edgeCache();
  const cacheKey = fanPulseCacheKey(url, segments);
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  const out: Array<{ segmentId: string; signals: FanPulsePacket[] }> = [];
  for (const segmentId of segments) {
    const id = env.BUS_PULSE.idFromName(fanPulseObjectName(segmentId));
    const stub = env.BUS_PULSE.get(id);
    const res = await stub
      .fetch(`https://fan-pulse.local/fan?segment=${encodeURIComponent(segmentId)}`)
      .catch(() => null);
    if (!res || !res.ok) continue;
    const body = (await res.json()) as { segmentId?: string; signals?: FanPulsePacket[] };
    if (body.segmentId && Array.isArray(body.signals)) out.push({ segmentId: body.segmentId, signals: body.signals });
  }

  const response = Response.json(
    { eventId: 'parade:2026-05-31', segments: out },
    { headers: { 'cache-control': 'public, max-age=5, s-maxage=5' } },
  );
  const waitUntil = requestWaitUntil(platform);
  if (cache) {
    const put = cache.put(cacheKey, response.clone()).catch((err) => {
      console.warn('fan pulse edge cache put failed', err);
    });
    if (waitUntil) waitUntil(put);
    else await put;
  }
  return response;
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const env = (platform?.env ?? {}) as FanPulseEnv;
  if (!env.BUS_PULSE) {
    return Response.json({ error: 'fan_pulse_unavailable' }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = validateFanPulsePacket(raw);
  if (!parsed.ok) return Response.json({ error: parsed.reason }, { status: 400 });

  const id = env.BUS_PULSE.idFromName(fanPulseObjectName(parsed.packet.segmentId));
  const stub = env.BUS_PULSE.get(id);
  try {
    return await stub.fetch(
      `https://fan-pulse.local/fan?segment=${encodeURIComponent(parsed.packet.segmentId)}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cf-connecting-ip': request.headers.get('cf-connecting-ip') ?? '',
          'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '',
        },
        body: JSON.stringify(raw),
      },
    );
  } catch {
    return Response.json({ error: 'fan_pulse_forward_failed' }, { status: 503 });
  }
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

function fanPulseCacheKey(url: URL, segments: string[]): Request {
  const sorted = [...segments].sort();
  return new Request(`${url.origin}${url.pathname}?segments=${sorted.join(',')}`, {
    method: 'GET',
  });
}

function edgeCache(): EdgeCache | null {
  const maybeGlobal = globalThis as unknown as { caches?: { default?: EdgeCache } };
  return maybeGlobal.caches?.default ?? null;
}

function requestWaitUntil(platform: App.Platform | undefined): ((promise: Promise<unknown>) => void) | undefined {
  const workerPlatform = platform as (App.Platform & {
    context?: ExecutionContext;
    ctx?: ExecutionContext;
  }) | undefined;
  const context = workerPlatform?.ctx ?? workerPlatform?.context;
  return context?.waitUntil?.bind(context);
}
