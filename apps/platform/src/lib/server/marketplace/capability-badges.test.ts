/**
 * Tests for `publicCapabilityBadges`.
 *
 * Direct port of the Postgres-side test (apps/web/lib/shippie/capability-badges.test.ts
 * if one existed; we re-derive the contract from the source code). The
 * key honesty rule: warn-status `Works Offline` is hidden, since "warn"
 * means the autopackager couldn't verify offline behaviour and showing
 * a yellow dot for an unverified capability is the dishonesty we cut.
 */
import { describe, expect, it } from 'bun:test';
import { publicCapabilityBadges } from './capability-badges';

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
