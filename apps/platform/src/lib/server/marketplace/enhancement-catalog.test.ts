/**
 * Tests for the enhancement catalog. Ported from
 * apps/web/app/dashboard/[appSlug]/enhancements/catalog.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import {
  CAPABILITY_CATALOG,
  extractEnabledCapabilityIds,
} from './enhancement-catalog';

describe('capability catalog', () => {
  test('every entry has a unique id', () => {
    const ids = CAPABILITY_CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every entry has a docs href under /docs/', () => {
    for (const entry of CAPABILITY_CATALOG) {
      expect(entry.docsHref.startsWith('/docs/')).toBe(true);
    }
  });

  test('every entry has a non-empty label and blurb', () => {
    for (const entry of CAPABILITY_CATALOG) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.blurb.length).toBeGreaterThan(0);
    }
  });
});

describe('extractEnabledCapabilityIds', () => {
  test('returns empty when given null', () => {
    expect(extractEnabledCapabilityIds(null)).toEqual([]);
  });

  test('returns empty when shippie.json has no opt-in fields', () => {
    expect(extractEnabledCapabilityIds({ name: 'My App' })).toEqual([]);
  });

  test('detects sound when sound === true', () => {
    expect(extractEnabledCapabilityIds({ sound: true })).toContain('sound');
  });

  test('does NOT detect sound when sound === false', () => {
    expect(extractEnabledCapabilityIds({ sound: false })).not.toContain('sound');
  });

  test('decomposes ai array into per-task ids', () => {
    const ids = extractEnabledCapabilityIds({ ai: ['classify', 'embed'] });
    expect(ids).toContain('ai-classify');
    expect(ids).toContain('ai-embed');
    expect(ids).not.toContain('ai-sentiment');
  });

  test('detects ambient.analyse', () => {
    expect(extractEnabledCapabilityIds({ ambient: { analyse: true } })).toContain('ambient');
  });

  test('detects groups.enabled', () => {
    expect(extractEnabledCapabilityIds({ groups: { enabled: true } })).toContain('groups');
  });

  test('detects backup.provider when set to any string', () => {
    expect(extractEnabledCapabilityIds({ backup: { provider: 'google-drive' } })).toContain('backup');
  });

  test('detects barcode when capabilities includes it', () => {
    expect(extractEnabledCapabilityIds({ capabilities: ['barcode'] })).toContain('barcode');
  });

  test('detects intelligence.spatial', () => {
    expect(extractEnabledCapabilityIds({ intelligence: { spatial: true } })).toContain('spatial');
  });

  test('detects intelligence.predictivePreload', () => {
    expect(
      extractEnabledCapabilityIds({ intelligence: { predictivePreload: true } }),
    ).toContain('predictive-preload');
  });
});
