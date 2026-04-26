/**
 * Tests for `publicCapabilityBadges`.
 *
 * Direct port of the Postgres-side test (apps/web/lib/shippie/capability-badges.test.ts
 * if one existed; we re-derive the contract from the source code). The
 * key honesty rule: warn-status `Works Offline` is hidden, since "warn"
 * means the autopackager couldn't verify offline behaviour and showing
 * a yellow dot for an unverified capability is the dishonesty we cut.
 */
import { describe, expect, it, test } from 'vitest';
import {
  publicCapabilityBadges,
  publicCapabilityBadgesFromProfile,
  badgesFromProfile,
} from './capability-badges';

describe('publicCapabilityBadges', () => {
  it('returns [] for null/undefined/non-object reports', () => {
    expect(publicCapabilityBadges(null)).toEqual([]);
    expect(publicCapabilityBadges(undefined)).toEqual([]);
    expect(publicCapabilityBadges('hi')).toEqual([]);
    expect(publicCapabilityBadges(42)).toEqual([]);
  });

  it('returns [] when no capability_badges key exists', () => {
    expect(publicCapabilityBadges({ wrapper_compat: { other: 1 } })).toEqual([]);
    expect(publicCapabilityBadges({ wrapper_compat: {} })).toEqual([]);
  });

  it('reads from wrapper_compat.capability_badges if present', () => {
    const report = {
      wrapper_compat: {
        capability_badges: [
          { label: 'Local Database', status: 'pass' },
          { label: 'Local AI', status: 'not_tested' },
        ],
      },
    };
    expect(publicCapabilityBadges(report)).toEqual([
      { label: 'Local Database', status: 'pass' },
      { label: 'Local AI', status: 'not_tested' },
    ]);
  });

  it('also reads from a top-level capability_badges (no wrapper_compat envelope)', () => {
    const report = {
      capability_badges: [{ label: 'Local Database', status: 'pass' }],
    };
    expect(publicCapabilityBadges(report)).toEqual([
      { label: 'Local Database', status: 'pass' },
    ]);
  });

  it('hides Works Offline when status is warn (the honesty rule)', () => {
    const report = {
      capability_badges: [
        { label: 'Works Offline', status: 'warn' },
        { label: 'Local Database', status: 'pass' },
      ],
    };
    const out = publicCapabilityBadges(report);
    expect(out.find((b) => b.label === 'Works Offline')).toBeUndefined();
    expect(out.find((b) => b.label === 'Local Database')).toBeDefined();
  });

  it('keeps Works Offline when status is pass', () => {
    const report = {
      capability_badges: [{ label: 'Works Offline', status: 'pass' }],
    };
    expect(publicCapabilityBadges(report)).toHaveLength(1);
  });

  it('caps the result at 5 entries', () => {
    const report = {
      capability_badges: Array.from({ length: 10 }, (_, i) => ({
        label: `Badge ${i}`,
        status: 'pass',
      })),
    };
    expect(publicCapabilityBadges(report)).toHaveLength(5);
  });

  it('drops badges with malformed shape', () => {
    const report = {
      capability_badges: [
        { label: 'Good', status: 'pass' },
        { label: null, status: 'pass' },
        { label: 'Bad status', status: 'maybe' },
        { status: 'pass' }, // missing label
      ],
    };
    expect(publicCapabilityBadges(report)).toEqual([
      { label: 'Good', status: 'pass' },
    ]);
  });
});

describe('badgesFromProfile', () => {
  it('returns [] for null/undefined/non-object', () => {
    expect(badgesFromProfile(null)).toEqual([]);
    expect(badgesFromProfile(undefined)).toEqual([]);
    expect(badgesFromProfile('hi')).toEqual([]);
  });

  it('emits Works Offline when framework.hasServiceWorker', () => {
    const out = badgesFromProfile({ framework: { hasServiceWorker: true } });
    expect(out).toContainEqual({ label: 'Works Offline', status: 'pass' });
  });

  it('emits WASM-accelerated when wasm.detected', () => {
    const out = badgesFromProfile({ wasm: { detected: true } });
    expect(out).toContainEqual({ label: 'WASM-accelerated', status: 'pass' });
  });

  it('emits Local AI when recommended.ai is a non-empty array', () => {
    const out = badgesFromProfile({ recommended: { ai: ['classify'] } });
    expect(out).toContainEqual({ label: 'Local AI', status: 'pass' });
  });

  it('does not emit Local AI when recommended.ai is false or empty', () => {
    expect(badgesFromProfile({ recommended: { ai: false } })).toEqual([]);
    expect(badgesFromProfile({ recommended: { ai: [] } })).toEqual([]);
  });
});

describe('publicCapabilityBadgesFromProfile', () => {
  it('returns profile badges when no report is present', () => {
    const out = publicCapabilityBadgesFromProfile(null, {
      framework: { hasServiceWorker: true },
    });
    expect(out).toEqual([{ label: 'Works Offline', status: 'pass' }]);
  });

  it('merges profile and report badges, profile first', () => {
    const profile = { framework: { hasServiceWorker: true } };
    const report = {
      capability_badges: [{ label: 'Local Database', status: 'pass' }],
    };
    expect(publicCapabilityBadgesFromProfile(report, profile)).toEqual([
      { label: 'Works Offline', status: 'pass' },
      { label: 'Local Database', status: 'pass' },
    ]);
  });

  it('profile wins on label collision', () => {
    const profile = { framework: { hasServiceWorker: true } };
    const report = {
      // The autopack report claims 'not_tested' but the profile saw a SW.
      capability_badges: [{ label: 'Works Offline', status: 'not_tested' }],
    };
    const out = publicCapabilityBadgesFromProfile(report, profile);
    expect(out.find((b) => b.label === 'Works Offline')?.status).toBe('pass');
  });

  it('caps at 5 entries', () => {
    const profile = {
      framework: { hasServiceWorker: true },
      wasm: { detected: true },
      recommended: { ai: ['classify'] },
    };
    const report = {
      capability_badges: Array.from({ length: 10 }, (_, i) => ({
        label: `Badge ${i}`,
        status: 'pass',
      })),
    };
    expect(publicCapabilityBadgesFromProfile(report, profile)).toHaveLength(5);
  });
});

describe('provenBadgesFromAwards', () => {
  test('maps known runtime badge slugs to display labels with proven=true', async () => {
    const { provenBadgesFromAwards } = await import('./capability-badges');
    const out = provenBadgesFromAwards([
      { badge: 'works-offline' },
      { badge: 'runs-local-db' },
      { badge: 'uses-local-ai' },
    ]);
    expect(out).toEqual([
      { label: 'Works Offline', status: 'pass', proven: true },
      { label: 'Local DB', status: 'pass', proven: true },
      { label: 'Local AI', status: 'pass', proven: true },
    ]);
  });

  test('drops unknown badge slugs', async () => {
    const { provenBadgesFromAwards } = await import('./capability-badges');
    const out = provenBadgesFromAwards([
      { badge: 'works-offline' },
      { badge: 'bogus-future-badge' },
    ]);
    expect(out).toEqual([{ label: 'Works Offline', status: 'pass', proven: true }]);
  });
});

describe('publicCapabilityBadgesWithProven', () => {
  test('proven entries appear first and outrank profile/autopack', async () => {
    const { publicCapabilityBadgesWithProven } = await import('./capability-badges');
    const proven = [{ badge: 'runs-local-db' }];
    const profile = { framework: { hasServiceWorker: true } };
    const report = { capability_badges: [{ label: 'Custom Badge', status: 'pass' }] };
    const out = publicCapabilityBadgesWithProven(proven, report, profile);
    expect(out[0]).toEqual({ label: 'Local DB', status: 'pass', proven: true });
    // Profile badge should follow.
    expect(out.some((b) => b.label === 'Works Offline')).toBe(true);
    expect(out.some((b) => b.label === 'Custom Badge')).toBe(true);
  });

  test('proven badge dedups against profile-derived label of the same name', async () => {
    const { publicCapabilityBadgesWithProven } = await import('./capability-badges');
    // Proven "Works Offline" should win over profile-derived "Works Offline".
    const proven = [{ badge: 'works-offline' }];
    const profile = { framework: { hasServiceWorker: true } };
    const out = publicCapabilityBadgesWithProven(proven, null, profile);
    const offline = out.filter((b) => b.label === 'Works Offline');
    expect(offline.length).toBe(1);
    expect(offline[0]?.proven).toBe(true);
  });

  test('caps merged result at 5 entries', async () => {
    const { publicCapabilityBadgesWithProven } = await import('./capability-badges');
    const proven = [
      { badge: 'works-offline' },
      { badge: 'runs-local-db' },
      { badge: 'uses-local-ai' },
      { badge: 'mesh-ready' },
    ];
    const report = {
      capability_badges: Array.from({ length: 10 }, (_, i) => ({
        label: `Pad ${i}`,
        status: 'pass',
      })),
    };
    const out = publicCapabilityBadgesWithProven(proven, report, null);
    expect(out.length).toBe(5);
    // First 4 are proven.
    expect(out.slice(0, 4).every((b) => b.proven === true)).toBe(true);
  });

  test('empty proven list falls through to profile + report exactly like the older helper', async () => {
    const { publicCapabilityBadgesWithProven, publicCapabilityBadgesFromProfile } = await import(
      './capability-badges'
    );
    const profile = { framework: { hasServiceWorker: true } };
    const report = { capability_badges: [{ label: 'Maker Reported', status: 'pass' }] };
    const newPath = publicCapabilityBadgesWithProven([], report, profile);
    const oldPath = publicCapabilityBadgesFromProfile(report, profile);
    expect(newPath).toEqual(oldPath);
  });
});
