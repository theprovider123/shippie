import { describe, expect, it } from 'vitest';
import { buildEnvelope, canonicalJSON, hashPayload, hasChanged, FEED_ENVELOPE_SCHEMA } from './envelope';

describe('canonicalJSON', () => {
  it('sorts object keys so equal payloads serialise identically', () => {
    expect(canonicalJSON({ b: 1, a: 2 })).toBe(canonicalJSON({ a: 2, b: 1 }));
  });
  it('recurses into nested objects and arrays', () => {
    expect(canonicalJSON({ x: [{ b: 1, a: 2 }] })).toBe('{"x":[{"a":2,"b":1}]}');
  });
});

describe('hashPayload', () => {
  it('is stable for equal-but-reordered payloads', () => {
    expect(hashPayload({ a: 1, b: 2 })).toBe(hashPayload({ b: 2, a: 1 }));
  });
  it('changes when the payload changes', () => {
    expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: 2 }));
  });
  it('is namespaced + fixed width', () => {
    expect(hashPayload({ a: 1 })).toMatch(/^fnv1a:[0-9a-f]{8}$/);
  });
});

describe('buildEnvelope', () => {
  it('assembles a versioned envelope with a hash and default source', () => {
    const env = buildEnvelope({
      app: 'golazo', feed: 'scores', dataSchema: 'golazo.scores.v1',
      payload: { live: [] }, sequence: 1, updatedAt: '2026-06-08T09:00:00Z',
    });
    expect(env.schema).toBe(FEED_ENVELOPE_SCHEMA);
    expect(env.source).toEqual({ kind: 'manual' });
    expect(env.hash).toBe(hashPayload({ live: [] }));
    expect(env).not.toHaveProperty('staleAfter');
  });
  it('includes staleAfter + source when given', () => {
    const env = buildEnvelope({
      app: 'a', feed: 'f', dataSchema: 'x.raw.v1', payload: {}, sequence: 3,
      updatedAt: 't', staleAfter: 't2', source: { kind: 'external-api', name: 'official' },
    });
    expect(env.staleAfter).toBe('t2');
    expect(env.source).toEqual({ kind: 'external-api', name: 'official' });
  });
});

describe('hasChanged', () => {
  it('is true when there is no since', () => {
    expect(hasChanged({ sequence: 5 })).toBe(true);
    expect(hasChanged({ sequence: 5 }, undefined)).toBe(true);
  });
  it('is true only when sequence advanced past since', () => {
    expect(hasChanged({ sequence: 5 }, 5)).toBe(false);
    expect(hasChanged({ sequence: 6 }, 5)).toBe(true);
    expect(hasChanged({ sequence: 5 }, 9)).toBe(false);
  });
});
