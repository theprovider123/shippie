import { describe, expect, it } from 'bun:test';
import {
  SIGNATURE_HEIGHT,
  SIGNATURE_WIDTH,
  isMeaningfulSignature,
  strokeToPath,
  strokesToSvg,
  svgToStrokes,
} from './signature.ts';

describe('strokeToPath', () => {
  it('emits an empty string for an empty stroke', () => {
    expect(strokeToPath([])).toBe('');
  });

  it('emits a moveto + line tail for a multi-point stroke', () => {
    const path = strokeToPath([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 50 },
    ]);
    expect(path).toBe('M10,20L30,40L50,50');
  });
});

describe('strokesToSvg + svgToStrokes round-trip', () => {
  it('round-trips a single stroke', () => {
    const original = [
      [
        { x: 5, y: 5 },
        { x: 10, y: 12 },
        { x: 15, y: 20 },
      ],
    ];
    const svg = strokesToSvg(original);
    const recovered = svgToStrokes(svg);
    expect(recovered).toEqual(original);
  });

  it('round-trips multiple strokes', () => {
    const original = [
      [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
      [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ],
    ];
    const svg = strokesToSvg(original);
    const recovered = svgToStrokes(svg);
    expect(recovered).toHaveLength(2);
    expect(recovered[0]).toEqual(original[0]);
    expect(recovered[1]).toEqual(original[1]);
  });

  it('embeds the canonical viewBox', () => {
    const svg = strokesToSvg([[{ x: 0, y: 0 }, { x: 1, y: 1 }]]);
    expect(svg).toContain(`viewBox="0 0 ${SIGNATURE_WIDTH} ${SIGNATURE_HEIGHT}"`);
  });

  it('skips empty strokes when serialising', () => {
    const svg = strokesToSvg([
      [],
      [{ x: 1, y: 1 }, { x: 2, y: 2 }],
    ]);
    const recovered = svgToStrokes(svg);
    expect(recovered).toHaveLength(1);
  });
});

describe('isMeaningfulSignature', () => {
  it('rejects empty / null / undefined', () => {
    expect(isMeaningfulSignature(null)).toBe(false);
    expect(isMeaningfulSignature(undefined)).toBe(false);
    expect(isMeaningfulSignature('')).toBe(false);
  });

  it('rejects a single-tap signature (under six points)', () => {
    const svg = strokesToSvg([
      [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
    ]);
    expect(isMeaningfulSignature(svg)).toBe(false);
  });

  it('accepts a real-looking signature', () => {
    const stroke = Array.from({ length: 12 }, (_, i) => ({ x: i, y: i }));
    const svg = strokesToSvg([stroke]);
    expect(isMeaningfulSignature(svg)).toBe(true);
  });
});
