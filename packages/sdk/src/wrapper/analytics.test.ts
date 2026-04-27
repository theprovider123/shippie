/**
 * Phase 6 privacy enforcement: schema-allowlist + serialized-payload
 * fixture tests. The contract is "forbidden fields cannot appear in
 * the output regardless of input shape." This file proves it.
 */
import { describe, expect, test } from 'bun:test';
import {
  buildBeacon,
  ALLOWED_BEACON_FIELDS,
  ALLOWED_METRIC_FIELDS,
  ALLOWED_PERFORMANCE_FIELDS,
  ALLOWED_COHORT_FIELDS,
} from './analytics.ts';

const VALID_HASH = 'a'.repeat(64);
const VALID_PERIOD = '2026-04-27';

function mkBeacon(extra: Record<string, unknown> = {}) {
  return buildBeacon({
    appSlug: 'recipe-saver',
    period: VALID_PERIOD,
    sessionHash: VALID_HASH,
    raw: extra,
  });
}

function listFieldsDeep(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [];
  const fields: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    fields.push(path);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      fields.push(...listFieldsDeep(v, path));
    }
  }
  return fields;
}

describe('buildBeacon — header validation', () => {
  test('rejects malformed slug', () => {
    expect(buildBeacon({ appSlug: 'NOT_VALID', period: VALID_PERIOD, sessionHash: VALID_HASH, raw: {} })).toBeNull();
  });
  test('rejects malformed period', () => {
    expect(buildBeacon({ appSlug: 'a', period: '04/27/2026', sessionHash: VALID_HASH, raw: {} })).toBeNull();
  });
  test('rejects malformed hash', () => {
    expect(buildBeacon({ appSlug: 'a', period: VALID_PERIOD, sessionHash: 'too-short', raw: {} })).toBeNull();
  });
  test('accepts a clean header', () => {
    const beacon = mkBeacon();
    expect(beacon).toBeTruthy();
    expect(beacon?.appSlug).toBe('recipe-saver');
    expect(beacon?.period).toBe(VALID_PERIOD);
    expect(beacon?.sessionHash).toBe(VALID_HASH);
  });
});

describe('schema allowlist — top level', () => {
  test('only allowlisted top-level fields are present', () => {
    const beacon = mkBeacon({
      // Inputs that include forbidden fields:
      userId: 'devante@example.com',
      ip: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      cookies: ['a', 'b'],
      metrics: {},
    })!;
    const keys = Object.keys(beacon);
    for (const key of keys) {
      expect(ALLOWED_BEACON_FIELDS as readonly string[]).toContain(key);
    }
  });

  test('inputs cannot inject extra top-level fields via spread', () => {
    const beacon = mkBeacon({
      // Even if the codec did `{...input, ...allowlist}`, this would
      // sneak in. The codec doesn't spread — it copies named fields.
      __proto__: { hacked: true },
      'x-track': 'should-strip',
    })!;
    expect((beacon as unknown as Record<string, unknown>)['x-track']).toBeUndefined();
    expect((beacon as unknown as Record<string, unknown>).hacked).toBeUndefined();
  });
});

describe('schema allowlist — pages', () => {
  test('parameterized routes are kept', () => {
    const beacon = mkBeacon({
      metrics: { pages: { '/': 1, '/recipes': 2, '/recipes/:id': 5 } },
    })!;
    expect(beacon.metrics.pages['/']).toBe(1);
    expect(beacon.metrics.pages['/recipes/:id']).toBe(5);
  });

  test('concrete IDs in route keys are stripped', () => {
    const beacon = mkBeacon({
      metrics: { pages: { '/recipes/carbonara-the-best': 3 } },
    })!;
    expect(beacon.metrics.pages['/recipes/carbonara-the-best']).toBeUndefined();
  });

  test('routes with query strings are stripped', () => {
    const beacon = mkBeacon({
      metrics: { pages: { '/search?q=secret': 1, '/path#fragment': 1 } },
    })!;
    expect(Object.keys(beacon.metrics.pages).length).toBe(0);
  });

  test('routes with raw user content are stripped', () => {
    const beacon = mkBeacon({
      metrics: {
        pages: {
          '/?user=devante@example.com': 1,
          '/page with space': 1,
        },
      },
    })!;
    expect(Object.keys(beacon.metrics.pages).length).toBe(0);
  });
});

describe('schema allowlist — actions', () => {
  test('short categorical actions kept', () => {
    const beacon = mkBeacon({
      metrics: {
        actions: {
          'recipe-saved': 1,
          'recipe-saved:cuisine=italian': 2,
        },
      },
    })!;
    expect(beacon.metrics.actions['recipe-saved']).toBe(1);
    expect(beacon.metrics.actions['recipe-saved:cuisine=italian']).toBe(2);
  });

  test('long free text in action params stripped', () => {
    const beacon = mkBeacon({
      metrics: {
        actions: {
          'search:q=this is a long search query the user typed': 1,
          'recipe-shared:title=carbonara recipe a long title': 1,
        },
      },
    })!;
    expect(Object.keys(beacon.metrics.actions).length).toBe(0);
  });

  test('actions containing emails / urls are stripped', () => {
    const beacon = mkBeacon({
      metrics: {
        actions: {
          'login:user=alice@example.com': 1,
          'click:href=https://example.com': 1,
        },
      },
    })!;
    expect(Object.keys(beacon.metrics.actions).length).toBe(0);
  });
});

describe('schema allowlist — performance', () => {
  test('only allowlisted perf fields survive', () => {
    const beacon = mkBeacon({
      metrics: {
        performance: {
          loadTime: 142,
          lcp: 280,
          cls: 0.02,
          inp: 30,
          // Forbidden / unknown fields:
          screen: '1920x1080',
          gpu: 'M3 Pro',
          memoryUsageBytes: 4096,
        },
      },
    })!;
    const fields = Object.keys(beacon.metrics.performance ?? {});
    for (const f of fields) {
      expect(ALLOWED_PERFORMANCE_FIELDS as readonly string[]).toContain(f);
    }
  });

  test('out-of-range numeric values dropped (no negative timings)', () => {
    const beacon = mkBeacon({
      metrics: {
        performance: { loadTime: -5, lcp: 300_000, cls: 999 },
      },
    })!;
    expect(beacon.metrics.performance?.loadTime).toBeUndefined();
    expect(beacon.metrics.performance?.lcp).toBeUndefined();
    expect(beacon.metrics.performance?.cls).toBeUndefined();
  });
});

describe('schema allowlist — cohort', () => {
  test('install week + days valid', () => {
    const beacon = mkBeacon({
      metrics: {
        cohort: { installWeek: '2026-W14', daysSinceInstall: 23, isActive: true },
      },
    })!;
    expect(beacon.metrics.cohort?.installWeek).toBe('2026-W14');
    expect(beacon.metrics.cohort?.daysSinceInstall).toBe(23);
    expect(beacon.metrics.cohort?.isActive).toBe(true);
  });

  test('cohort fields outside allowlist are stripped', () => {
    const beacon = mkBeacon({
      metrics: {
        cohort: {
          installWeek: '2026-W14',
          daysSinceInstall: 23,
          isActive: true,
          // forbidden:
          installedAt: '2026-04-04T15:32:08Z',
          country: 'GB',
        },
      },
    })!;
    const fields = Object.keys(beacon.metrics.cohort ?? {});
    for (const f of fields) {
      expect(ALLOWED_COHORT_FIELDS as readonly string[]).toContain(f);
    }
  });

  test('malformed install week drops cohort entirely', () => {
    const beacon = mkBeacon({
      metrics: { cohort: { installWeek: '2026-04-04', daysSinceInstall: 23, isActive: true } },
    })!;
    expect(beacon.metrics.cohort).toBeUndefined();
  });
});

describe('serialized payload — no forbidden fields anywhere', () => {
  test('full attack payload yields a clean beacon', () => {
    const beacon = mkBeacon({
      // Forbidden across every level.
      userId: 'devante@example.com',
      email: 'devante@example.com',
      ip: '127.0.0.1',
      city: 'London',
      country: 'GB',
      deviceId: 'persistent-uuid-1234',
      gpsLat: 51.5,
      gpsLon: -0.1,
      metrics: {
        searchQueries: ['carbonara recipe', 'how to ramen'],
        pages: { '/recipes/abc-123': 4, '/recipes/:id': 5 },
        actions: { 'recipe-viewed:title=My grandma carbonara': 1, 'recipe-saved': 2 },
        performance: { loadTime: 100, screenW: 390, gpuLogs: 'M3' },
        cohort: { installWeek: '2026-W14', daysSinceInstall: 23, isActive: true, ip: '1.1.1.1' },
        // Forbidden top-level metric:
        rawJourney: [{ at: 'iso', from: '/', to: '/recipes' }],
      },
    })!;

    const fields = listFieldsDeep(beacon);

    // No forbidden patterns anywhere in the rendered shape.
    const forbiddenPatterns = [
      /userId/i,
      /\bemail\b/i,
      /\bip\b/i,
      /\bcity\b/i,
      /\bgps/i,
      /\.country$/,
      /screenW/,
      /searchQueries/,
      /rawJourney/,
      /deviceId/,
    ];
    for (const path of fields) {
      for (const pat of forbiddenPatterns) {
        expect(pat.test(path)).toBe(false);
      }
    }

    // Top-level keys = allowlist exactly.
    for (const k of Object.keys(beacon)) {
      expect(ALLOWED_BEACON_FIELDS as readonly string[]).toContain(k);
    }
    for (const k of Object.keys(beacon.metrics)) {
      expect(ALLOWED_METRIC_FIELDS as readonly string[]).toContain(k);
    }

    // The kept counts are still sensible.
    expect(beacon.metrics.pages['/recipes/:id']).toBe(5);
    expect(beacon.metrics.actions['recipe-saved']).toBe(2);
  });

  test('JSON.stringify never contains anything that looks like personal content', () => {
    const beacon = mkBeacon({
      metrics: {
        pages: { '/recipes/MyDeepestSecret': 1, '/?q=should-not-appear-in-output': 1 },
        actions: { 'logged-in:email=alice@example.com': 1 },
      },
    })!;
    const json = JSON.stringify(beacon);
    expect(json.includes('MyDeepestSecret')).toBe(false);
    expect(json.includes('should-not-appear-in-output')).toBe(false);
    expect(json.includes('alice@example.com')).toBe(false);
  });
});
