import { describe, expect, test } from 'bun:test';
import { FALLBACK_ROUTE_PACK } from '../data/parade-2026';
import { createFanEvent } from './fan-events';
import {
  fanEventToPulsePacket,
  pullFanPulse,
  publishFanPulse,
  pulsePacketToFanEvent,
  routeSegmentIds,
} from './live-sync';

const route = FALLBACK_ROUTE_PACK.route.coordinates;
const position = { lng: -0.1048, lat: 51.5487, accuracyM: 18 };

describe('live fan pulse sync', () => {
  test('builds relay segments from the route', () => {
    const segments = routeSegmentIds(route);
    expect(segments.length).toBe(route.length - 1);
    expect(segments[0]).toBe('seg-0');
  });

  test('turns a local fan event into an anonymous relay packet', () => {
    const event = createFanEvent('toilet_queue', position, route, 'fan_test');
    const packet = fanEventToPulsePacket(event, route);

    expect(packet).toMatchObject({
      id: event.id,
      type: 'toilet_queue',
      sourceId: 'fan_test',
      segmentId: expect.stringMatching(/^seg-/),
      eventSegmentId: null,
    });
    expect(Object.keys(packet ?? {}).sort()).not.toContain('displayName');
  });

  test('imports relay packets as relay fan events', () => {
    const event = createFanEvent('bus_seen', position, route, 'fan_test');
    const packet = fanEventToPulsePacket(event, route);
    expect(packet).not.toBeNull();

    const imported = pulsePacketToFanEvent(packet!);

    expect(imported?.source).toBe('relay');
    expect(imported?.type).toBe('bus_seen');
    expect(imported?.source_id).toBe('fan_test');
  });

  test('publishes local fan events by POSTing tiny packets', async () => {
    const event = createFanEvent('presence', position, route, 'fan_test');
    const calls: string[] = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(init?.body ?? ''));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const published = await publishFanPulse([event], route, '/pulse', fetchImpl);

    expect(published).toBe(1);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0] as string)).toMatchObject({ type: 'presence', sourceId: 'fan_test' });
  });

  test('pulls relay packets from all route segments and validates them', async () => {
    const event = createFanEvent('bus_seen', position, route, 'fan_test');
    const packet = fanEventToPulsePacket(event, route);
    const fetchImpl = (async (input: RequestInfo | URL) => {
      expect(String(input)).toContain('segments=');
      return new Response(
        JSON.stringify({
          segments: [{ segmentId: packet!.segmentId, signals: [packet] }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const pulled = await pullFanPulse(route, '/pulse', fetchImpl);

    expect(pulled).toHaveLength(1);
    expect(pulled[0]?.source).toBe('relay');
  });
});
