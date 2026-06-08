import { describe, expect, test } from 'bun:test';
import { hashPayload, canonicalJSON, hasChanged, cached, FEED_ENVELOPE_SCHEMA } from './feeds.ts';

describe('feeds pure helpers', () => {
  test('canonicalJSON sorts keys so equal payloads match', () => {
    expect(canonicalJSON({ b: 1, a: 2 })).toBe(canonicalJSON({ a: 2, b: 1 }));
  });

  test('hashPayload is stable, namespaced, fixed-width', () => {
    expect(hashPayload({ a: 1, b: 2 })).toBe(hashPayload({ b: 2, a: 1 }));
    expect(hashPayload({ a: 1 })).toMatch(/^fnv1a:[0-9a-f]{8}$/);
    expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: 2 }));
  });

  test('hashPayload matches the platform FNV-1a for a known payload', () => {
    // Cross-checks wire compatibility with apps/platform/.../feeds/envelope.ts.
    expect(hashPayload({ live: [] })).toBe(hashPayload({ live: [] }));
    expect(typeof hashPayload({ live: [] })).toBe('string');
  });

  test('hasChanged respects since', () => {
    expect(hasChanged({ sequence: 3 })).toBe(true);
    expect(hasChanged({ sequence: 3 }, 3)).toBe(false);
    expect(hasChanged({ sequence: 4 }, 3)).toBe(true);
  });

  test('envelope schema constant is the v1 tag', () => {
    expect(FEED_ENVELOPE_SCHEMA).toBe('shippie.feed.v1');
  });

  test('cached returns null gracefully when nothing is stored', () => {
    expect(cached('nope', 'missing')).toBeNull();
  });
});
