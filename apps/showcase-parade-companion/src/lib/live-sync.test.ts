import { describe, expect, test } from 'bun:test';
import { FALLBACK_ROUTE_PACK } from '../data/parade-2026';
import { createFanEvent } from './fan-events';
import {
  fanEventToPulsePacket,
  isPublishableFanEvent,
  pullFanPulse,
  publishFanPulse,
  pulsePacketToFanEvent,
  routeSegmentIds,
  selectFanPulseEvents,
} from './live-sync';

const route = FALLBACK_ROUTE_PACK.route.coordinates;
const position = { lng: -0.1048, lat: 51.5487, accuracyM: 18 };
const ACTIVE_NOW = new Date('2026-05-31T14:00:00+01:00');
const ACTIVE_NOW_MS = ACTIVE_NOW.getTime();
const MIDDAY_NOW_MS = Date.parse('2026-05-31T12:05:00+01:00');

describe('live fan pulse sync', () => {
  test('builds relay segments from the route', () => {
    const segments = routeSegmentIds(route);
    expect(segments.length).toBe(route.length - 1);
    expect(segments[0]).toBe('seg-0');
  });

  test('turns a local fan event into an anonymous relay packet', () => {
    const event = createFanEvent(
      'toilet_queue',
      { lng: -0.1048123, lat: 51.5487456, accuracyM: 18 },
      route,
      'fan_test',
      ACTIVE_NOW,
    );
    const packet = fanEventToPulsePacket(event, route, ACTIVE_NOW_MS);

    expect(packet).toMatchObject({
      id: event.id,
      type: 'toilet_queue',
      sourceId: 'fan_test',
      segmentId: expect.stringMatching(/^seg-/),
      eventSegmentId: null,
    });
    expect(packet?.lng).toBe(Number(event.lng.toFixed(4)));
    expect(packet?.lat).toBe(Number(event.lat.toFixed(4)));
    expect(packet?.accuracyM).toBeGreaterThanOrEqual(20);
    expect(Object.keys(packet ?? {}).sort()).not.toContain('displayName');
  });

  test('does not publish fan events after their public expiry', () => {
    const expired = {
      ...createFanEvent('bus_seen', position, route, 'fan_expired', ACTIVE_NOW),
      expires_at: new Date(ACTIVE_NOW_MS - 1000).toISOString(),
    };

    expect(isPublishableFanEvent(expired, ACTIVE_NOW_MS)).toBe(false);
    expect(fanEventToPulsePacket(expired, route, ACTIVE_NOW_MS)).toBeNull();
  });

  test('imports relay packets as relay fan events', () => {
    const event = createFanEvent('bus_seen', position, route, 'fan_test', ACTIVE_NOW);
    const packet = fanEventToPulsePacket(event, route, ACTIVE_NOW_MS);
    expect(packet).not.toBeNull();

    const imported = pulsePacketToFanEvent(packet!);

    expect(imported?.source).toBe('relay');
    expect(imported?.type).toBe('bus_seen');
    expect(imported?.source_id).toBe('fan_test');
  });

  test('publishes local fan events by POSTing tiny packets', async () => {
    const event = createFanEvent('presence', position, route, 'fan_test', ACTIVE_NOW);
    const calls: string[] = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(init?.body ?? ''));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const published = await publishFanPulse([event], route, '/pulse', fetchImpl, ACTIVE_NOW_MS);

    expect(published).toBe(1);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0] as string)).toMatchObject({ type: 'presence', sourceId: 'fan_test' });
  });

  test('selects a small priority batch for weak-signal sync', () => {
    const events = [
      createFanEvent('presence', position, route, 'fan_a', new Date('2026-05-31T12:00:00+01:00')),
      createFanEvent('bus_seen', position, route, 'fan_a', new Date('2026-05-31T12:01:00+01:00')),
      createFanEvent('toilet_queue', position, route, 'fan_a', new Date('2026-05-31T12:02:00+01:00')),
    ];

    const selected = selectFanPulseEvents(events, 2, MIDDAY_NOW_MS);

    expect(selected.map((event) => event.type)).toEqual(['bus_seen', 'toilet_queue']);
  });

  test('pulls relay packets from all route segments and validates them', async () => {
    const event = createFanEvent('bus_seen', position, route, 'fan_test', ACTIVE_NOW);
    const packet = fanEventToPulsePacket(event, route, ACTIVE_NOW_MS);
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
