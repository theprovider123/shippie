/**
 * Tests for `publicCapabilityBadges`.
 *
 * Direct port of the Postgres-side test (apps/web/lib/shippie/capability-badges.test.ts
 * if one existed; we re-derive the contract from the source code). The
 * key honesty rule: warn-status `Works Offline` is hidden, since "warn"
 * means the autopackager couldn't verify offline behaviour and showing
 * a yellow dot for an unverified capability is the dishonesty we cut.
 */
import { describe, expect, it } from 'vitest';
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
