import type { RequestHandler } from './$types';
import {
  banterPulseObjectName,
  banterPulseShardForSource,
  banterPulseShardIds,
  isValidBanterShardId,
  validateBanterPulseBatch,
  type BanterPollAggregate,
} from '$lib/server/parade/bus-pulse';

interface BanterPulseNamespace {
  idFromName(name: string): { toString(): string };
  get(id: { toString(): string }): { fetch: (input: string, init?: RequestInit) => Promise<Response> };
}

interface BanterPulseEnv {
  BUS_PULSE?: BanterPulseNamespace;
}

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export const GET: RequestHandler = async ({ url, platform }) => {
  const env = (platform?.env ?? {}) as BanterPulseEnv;
  if (!env.BUS_PULSE) {
    return Response.json({ error: 'banter_pulse_unavailable', aggregates: [] }, { status: 503 });
  }

  const pollIds = parsePollIds(url.searchParams.get('polls'));
  const cache = edgeCache();
  const cacheKey = banterPulseCacheKey(url, pollIds);
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  const merged = new Map<string, BanterPollAggregate>();
  for (const shardId of banterPulseShardIds()) {
    const id = env.BUS_PULSE.idFromName(banterPulseObjectName(shardId));
    const stub = env.BUS_PULSE.get(id);
    const res = await stub
      .fetch(`https://banter-pulse.local/banter?shard=${encodeURIComponent(shardId)}`)
      .catch(() => null);
    if (!res || !res.ok) continue;
    const body = (await res.json()) as { aggregates?: BanterPollAggregate[] };
    for (const aggregate of body.aggregates ?? []) {
      if (pollIds.length > 0 && !pollIds.includes(aggregate.pollId)) continue;
      const current = merged.get(aggregate.pollId) ?? {
        pollId: aggregate.pollId,
        total: 0,
        options: {},
        updatedAt: null,
      };
      current.total += aggregate.total;
      if (aggregate.updatedAt && (!current.updatedAt || aggregate.updatedAt > current.updatedAt)) {
        current.updatedAt = aggregate.updatedAt;
      }
      for (const [optionId, count] of Object.entries(aggregate.options)) {
        current.options[optionId] = (current.options[optionId] ?? 0) + count;
      }
      merged.set(current.pollId, current);
    }
  }

  const response = Response.json(
    { eventId: 'parade:2026-05-31', aggregates: [...merged.values()].sort((a, b) => a.pollId.localeCompare(b.pollId)) },
    { headers: { 'cache-control': 'public, max-age=5, s-maxage=5' } },
  );
  const waitUntil = requestWaitUntil(platform);
  if (cache) {
    const put = cache.put(cacheKey, response.clone()).catch((err) => {
      console.warn('banter pulse edge cache put failed', err);
    });
    if (waitUntil) waitUntil(put);
    else await put;
  }
  return response;
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const env = (platform?.env ?? {}) as BanterPulseEnv;
  if (!env.BUS_PULSE) {
    return Response.json({ error: 'banter_pulse_unavailable' }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = validateBanterPulseBatch(raw);
  if (!parsed.ok) return Response.json({ error: parsed.reason }, { status: 400 });

  const shardId = banterPulseShardForSource(parsed.packets[0].sourceId);
  if (!isValidBanterShardId(shardId)) {
    return Response.json({ error: 'invalid_shard' }, { status: 400 });
  }
  const id = env.BUS_PULSE.idFromName(banterPulseObjectName(shardId));
  const stub = env.BUS_PULSE.get(id);
  try {
    return await stub.fetch(
      `https://banter-pulse.local/banter?shard=${encodeURIComponent(shardId)}`,
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
    return Response.json({ error: 'banter_pulse_forward_failed' }, { status: 503 });
  }
};

function parsePollIds(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const item of raw.split(',')) {
    const pollId = item.trim();
    if (!/^[a-z0-9-]{2,48}$/.test(pollId)) continue;
    seen.add(pollId);
    if (seen.size >= 12) break;
  }
  return [...seen];
}

function banterPulseCacheKey(url: URL, pollIds: string[]): Request {
  const sorted = [...pollIds].sort();
  return new Request(`${url.origin}${url.pathname}?polls=${sorted.join(',')}`, {
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
