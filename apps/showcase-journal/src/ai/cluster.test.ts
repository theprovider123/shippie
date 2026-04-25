import { describe, expect, it } from 'bun:test';
import { cosine, groupByTopic, rankByCosine, selectTopByMagnitude, toFloat32 } from './cluster.ts';

describe('cosine', () => {
  it('returns 1 for identical vectors', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosine(a, b)).toBeCloseTo(1, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosine(a, b)).toBeCloseTo(0, 5);
  });

  it('returns -1 for anti-parallel vectors', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([-1, 0]);
    expect(cosine(a, b)).toBeCloseTo(-1, 5);
  });

  it('returns NaN for mismatched lengths', () => {
    expect(Number.isNaN(cosine(new Float32Array([1, 2]), new Float32Array([1])))).toBe(true);
  });
});

describe('rankByCosine', () => {
  it('orders by descending similarity and respects limit', () => {
    const query = new Float32Array([1, 0]);
    const entries: Array<{ id: string; embedding: Float32Array | null }> = [
      { id: '1', embedding: new Float32Array([1, 0]) },
      { id: '2', embedding: new Float32Array([0, 1]) },
      { id: '3', embedding: new Float32Array([0.7, 0.7]) },
      { id: '4', embedding: null },
    ];
    const ranked = rankByCosine(query, entries, 2);
    expect(ranked.map((r) => r.entry.id)).toEqual(['1', '3']);
    expect(ranked[0]!.score).toBeGreaterThanOrEqual(ranked[1]!.score);
  });

  it('skips entries with no embedding', () => {
    const entries: Array<{ id: string; embedding?: Float32Array | null }> = [{ id: 'x' }];
    const ranked = rankByCosine(new Float32Array([1, 0]), entries);
    expect(ranked).toEqual([]);
  });
});

describe('selectTopByMagnitude', () => {
  it('returns biggest |sentiment| values', () => {
    const top = selectTopByMagnitude(
      [
        { id: 'a', sentiment: 0.1 },
        { id: 'b', sentiment: -0.9 },
        { id: 'c', sentiment: 0.8 },
        { id: 'd', sentiment: null },
        { id: 'e', sentiment: 0.05 },
      ],
      3,
    );
    expect(top.map((t) => t.entry.id)).toEqual(['b', 'c', 'a']);
    expect(top[0]!.magnitude).toBeCloseTo(0.9, 5);
  });
});

describe('groupByTopic', () => {
  it('buckets entries and falls back to unclassified', () => {
    const grouped = groupByTopic([
      { topic: 'work' },
      { topic: 'work' },
      { topic: null },
      { topic: 'health' },
    ]);
    expect(grouped.get('work')).toHaveLength(2);
    expect(grouped.get('health')).toHaveLength(1);
    expect(grouped.get('unclassified')).toHaveLength(1);
  });
});

describe('toFloat32', () => {
  it('decodes a Uint8Array view of float32 bytes', () => {
    const original = new Float32Array([0.5, 1, -1.5]);
    const bytes = new Uint8Array(original.buffer);
    const decoded = toFloat32(bytes);
    expect(decoded).not.toBeNull();
    expect(Array.from(decoded!)).toEqual(Array.from(original));
  });

  it('passes through Float32Array', () => {
    const v = new Float32Array([1, 2]);
    expect(toFloat32(v)).toBe(v);
  });

  it('returns null for incompatible inputs', () => {
    expect(toFloat32('hello')).toBeNull();
    expect(toFloat32(null)).toBeNull();
    expect(toFloat32(undefined)).toBeNull();
  });
});
