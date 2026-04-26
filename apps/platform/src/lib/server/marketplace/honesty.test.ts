/**
 * Tests for the honesty pass.
 *
 * The point of these tests isn't behavioural complexity — `honestyFor`
 * returns a constant today. They pin the contract so the post-honesty-pass
 * design can't quietly regress when someone adds "compatibility score 5/5"
 * back to the detail page.
 *
 * If a future change adds per-app exceptions (e.g. official Shippie apps
 * with audited compatibility scores), update these tests with the
 * exception predicate so the regression net stays tight.
 */
import { describe, expect, it } from 'vitest';
import { honestyFor, describeGrantedPermissions } from './honesty';

describe('honestyFor', () => {
  it('hides fabricated 5/5 compatibility scores, V2 tech badge, external-domains noise', () => {
    const out = honestyFor({ compatibilityScore: 5 });
    expect(out.showCompatibilityScore).toBe(false);
    expect(out.showTechBadge).toBe(false);
    expect(out.showExternalDomains).toBe(false);
  });

  it('also hides them when score is 0/null/undefined (no implicit "no rating means good")', () => {
    expect(honestyFor({ compatibilityScore: 0 }).showCompatibilityScore).toBe(false);
    expect(honestyFor({ compatibilityScore: null }).showCompatibilityScore).toBe(false);
    expect(honestyFor({}).showCompatibilityScore).toBe(false);
  });
});

describe('describeGrantedPermissions', () => {
  it('returns [] for null input', () => {
    expect(describeGrantedPermissions(null)).toEqual([]);
  });

  it('returns [] when no permissions granted', () => {
    expect(
      describeGrantedPermissions({
        auth: false,
        storage: 'none',
        files: false,
        notifications: false,
        externalNetwork: false,
      }),
    ).toEqual([]);
  });

  it('translates each granted permission to a human-readable string', () => {
    expect(
      describeGrantedPermissions({
        auth: true,
        storage: 'rw',
        files: true,
        notifications: true,
        externalNetwork: true,
      }),
    ).toEqual([
      'Sign you in',
      'Save your data',
      'Accept file uploads',
      'Send notifications',
      'Talk to external services',
    ]);
  });

  it('treats storage="r" as granted (read-only counts)', () => {
    const out = describeGrantedPermissions({ storage: 'r' });
    expect(out).toContain('Save your data');
  });

  it('treats storage="none" as not granted', () => {
    const out = describeGrantedPermissions({ storage: 'none' });
    expect(out).not.toContain('Save your data');
  });
});
