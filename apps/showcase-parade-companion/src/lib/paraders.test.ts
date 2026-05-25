import { describe, expect, test } from 'bun:test';
import type { FanEvent } from './fan-events';
import { countActiveParaders } from './paraders';

const NOW = Date.parse('2026-05-31T14:30:00+01:00');

function presence(overrides: Partial<FanEvent> = {}): FanEvent {
  return {
    id: overrides.id ?? `ev_${Math.random().toString(36).slice(2)}`,
    type: 'presence',
    source_id: overrides.source_id ?? `src_${Math.random().toString(36).slice(2)}`,
    source: 'local',
    lng: -0.1031,
    lat: 51.5460,
    accuracy_m: 25,
    segment_id: 'seg-1',
    segment_index: 1,
    snapped_lng: -0.1031,
    snapped_lat: 51.5460,
    created_at: new Date(NOW - 60_000).toISOString(),
    expires_at: new Date(NOW + 30 * 60_000).toISOString(),
    ...overrides,
  };
}

describe('paraders', () => {
  test('counts unique active presence source_ids', () => {
    const events = [
      presence({ source_id: 'a' }),
      presence({ source_id: 'b' }),
      presence({ source_id: 'a' }), // duplicate — should count once
      presence({ source_id: 'c' }),
    ];
    const result = countActiveParaders(events, null, NOW);
    expect(result.total).toBe(3);
    expect(result.nearby).toBeNull();
  });

  test('ignores non-presence events', () => {
    const events = [
      presence({ source_id: 'a' }),
      { ...presence({ source_id: 'b' }), type: 'bus_seen' as const },
      { ...presence({ source_id: 'c' }), type: 'crowd_dense' as const },
    ];
    expect(countActiveParaders(events, null, NOW).total).toBe(1);
  });

  test('ignores expired events', () => {
    const expired = presence({
      source_id: 'old',
      expires_at: new Date(NOW - 60_000).toISOString(),
    });
    const fresh = presence({ source_id: 'new' });
    expect(countActiveParaders([expired, fresh], null, NOW).total).toBe(1);
  });

  test('nearby filter counts only phones within 500 m of here', () => {
    const close = presence({ source_id: 'close', lng: -0.1031, lat: 51.5460 });
    const far = presence({ source_id: 'far', lng: -0.1062, lat: 51.5327 }); // Angel, ~1.5 km south
    const here = { lng: -0.1031, lat: 51.5462 };
    const result = countActiveParaders([close, far], here, NOW);
    expect(result.total).toBe(2);
    expect(result.nearby).toBe(1);
  });

  test('empty list returns zero counts', () => {
    const result = countActiveParaders([], { lng: -0.1031, lat: 51.5460 }, NOW);
    expect(result.total).toBe(0);
    expect(result.nearby).toBe(0);
  });
});
