import { describe, expect, test } from 'vitest';
import { banterPulseShardForSource } from '$lib/server/parade/bus-pulse';
import { GET as GET_BANTER, POST as POST_BANTER } from './banter-pulse/+server';
import { GET as GET_BUS, POST as POST_BUS } from './bus-pulse/+server';
import { GET as GET_FAN, POST as POST_FAN } from './fan-pulse/+server';

interface ForwardedCall {
  input: string;
  init?: RequestInit;
}

describe('parade relay routes', () => {
  test('bus pulse forwards as string URL plus init for Durable Object compatibility', async () => {
    const calls: ForwardedCall[] = [];
    const event = eventFor('/__shippie/parade/bus-pulse', {
      segmentId: 'seg-1',
      kind: 'here',
      accuracyM: 18,
      createdAt: new Date().toISOString(),
    }, calls);

    const response = await POST_BUS(event);

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe('https://bus-pulse.local/?segment=seg-1');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.body).toContain('"segmentId":"seg-1"');
  });

  test('fan pulse forwards anonymous fan signals as string URL plus init', async () => {
    const now = Date.now();
    const calls: ForwardedCall[] = [];
    const event = eventFor<Parameters<typeof POST_FAN>[0]>('/__shippie/parade/fan-pulse', {
      id: 'toilet_queue_abc123',
      type: 'toilet_queue',
      sourceId: 'fan_abc123',
      lng: -0.1048,
      lat: 51.5487,
      accuracyM: 18,
      segmentId: 'seg-2',
      eventSegmentId: null,
      eventSegmentIndex: null,
      snappedLng: null,
      snappedLat: null,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 60 * 60_000).toISOString(),
    }, calls);

    const response = await POST_FAN(event);

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe('https://fan-pulse.local/fan?segment=seg-2');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.body).toContain('"type":"toilet_queue"');
  });

  test('banter pulse shards fixed-choice votes without sending free text', async () => {
    const sourceId = 'fan_abc123';
    const shardId = banterPulseShardForSource(sourceId);
    const calls: ForwardedCall[] = [];
    const event = eventFor<Parameters<typeof POST_BANTER>[0]>('/__shippie/parade/banter-pulse', {
      votes: [
        {
          pollId: 'player-of-season',
          optionId: 'raya',
          sourceId,
          updatedAt: new Date().toISOString(),
        },
      ],
    }, calls);

    const response = await POST_BANTER(event);

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe(`https://banter-pulse.local/banter?shard=${shardId}`);
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.body).toBe(JSON.stringify({
      votes: [
        {
          pollId: 'player-of-season',
          optionId: 'raya',
          sourceId,
          updatedAt: JSON.parse(calls[0]?.init?.body as string).votes[0].updatedAt,
        },
      ],
    }));
    expect(calls[0]?.init?.body).not.toContain('displayName');
  });

  test('read endpoints degrade to empty payloads when a relay object is unavailable', async () => {
    const platform = platformFor([], async () => {
      throw new Error('relay unavailable');
    });

    const bus = await GET_BUS({
      url: new URL('https://shippie.app/__shippie/parade/bus-pulse?segments=seg-0,seg-1'),
      platform,
    } as unknown as Parameters<typeof GET_BUS>[0]);
    expect(bus.status).toBe(200);
    expect(await bus.json()).toMatchObject({ aggregates: [] });

    const fan = await GET_FAN({
      url: new URL('https://shippie.app/__shippie/parade/fan-pulse?segments=seg-0,seg-1'),
      platform,
    } as unknown as Parameters<typeof GET_FAN>[0]);
    expect(fan.status).toBe(200);
    expect(await fan.json()).toMatchObject({ segments: [] });

    const banter = await GET_BANTER({
      url: new URL('https://shippie.app/__shippie/parade/banter-pulse?polls=player-of-season'),
      platform,
    } as unknown as Parameters<typeof GET_BANTER>[0]);
    expect(banter.status).toBe(200);
    expect(await banter.json()).toMatchObject({ aggregates: [] });
  });

  test('write endpoints return a clean 503 instead of leaking relay exceptions', async () => {
    const event = eventFor('/__shippie/parade/bus-pulse', {
      segmentId: 'seg-1',
      kind: 'here',
      accuracyM: 18,
      createdAt: new Date().toISOString(),
    }, [], async () => {
      throw new Error('relay unavailable');
    });

    const response = await POST_BUS(event);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'bus_pulse_forward_failed' });
  });
});

function eventFor<T = Parameters<typeof POST_BUS>[0]>(
  path: string,
  body: unknown,
  calls: ForwardedCall[],
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>,
): T {
  const request = new Request(`https://shippie.app${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': '203.0.113.20',
    },
    body: JSON.stringify(body),
  });
  return {
    request,
    url: new URL(request.url),
    platform: platformFor(calls, fetchImpl),
  } as unknown as T;
}

function platformFor(
  calls: ForwardedCall[],
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = async (input, init) => {
    calls.push({ input, init });
    return Response.json({ ok: true });
  },
) {
  return {
    env: {
      BUS_PULSE: {
        idFromName(name: string) {
          return { toString: () => name };
        },
        get() {
          return {
            fetch(input: string, init?: RequestInit) {
              return fetchImpl(input, init);
            },
          };
        },
      },
    },
  };
}
