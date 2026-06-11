// Scale drag math tests (clamp + quantize)
import { describe, expect, it } from 'bun:test';

function scaleFromDrag(startG: number, dx: number): number {
  const raw = startG + dx * 3;
  return Math.max(600, Math.min(3200, Math.round(raw / 10) * 10));
}

describe('scale drag clamp + quantize', () => {
  it('quantizes to 10g', () => {
    // 1800 + 1*3 = 1803 → 1803/10 = 180.3 → round(180) → 1800
    expect(scaleFromDrag(1800, 1)).toBe(1800);
    // 1800 + 4*3 = 1812 → 1812/10 = 181.2 → round(181) → 1810
    expect(scaleFromDrag(1800, 4)).toBe(1810);
  });

  it('clamps to 600 min', () => {
    expect(scaleFromDrag(600, -500)).toBe(600);
  });

  it('clamps to 3200 max', () => {
    expect(scaleFromDrag(3200, 500)).toBe(3200);
  });

  it('3x multiplier: 100px drag = 300g', () => {
    const result = scaleFromDrag(1000, 100);
    expect(result).toBe(1300);
  });

  it('negative drag reduces total', () => {
    expect(scaleFromDrag(1800, -100)).toBe(1500);
  });

  it('quantizes 1805 to 1810', () => {
    // raw = 1805 → 1805/10 = 180.5 → round = 181 → 1810
    expect(scaleFromDrag(1800, 1.67)).toBe(1810);
  });
});

// Dial angle math tests
describe('dial angle to minutes mapping', () => {
  function minutesFromDeg(deg: number): number {
    let d = ((deg % 360) + 360) % 360;
    let min = Math.round((d / 360) * 60 * 2) / 2;
    if (min === 0) min = 60;
    return min;
  }

  it('0° = 60 min (top position wraps to max)', () => {
    expect(minutesFromDeg(0)).toBe(60);
  });

  it('180° = 30 min (halfway)', () => {
    expect(minutesFromDeg(180)).toBe(30);
  });

  it('90° = 15 min', () => {
    expect(minutesFromDeg(90)).toBe(15);
  });

  it('quantizes to 0.5min (30s)', () => {
    // 270° → 270/360 * 120 = 90 → 45min
    expect(minutesFromDeg(270)).toBe(45);
    // 271.5° → 271.5/360 * 120 = 90.5 → round(91) → 45.5min
    expect(minutesFromDeg(271.5)).toBe(45.5);
  });
});

// Probe state transitions
import { probeState } from './engine.ts';

describe('probe state transitions', () => {
  const cases: Array<[number, number, 'tracking' | 'nearly' | 'pull']> = [
    [44, 52, 'tracking'],    // 8° below
    [49, 52, 'nearly'],      // 3° below — boundary
    [50, 52, 'nearly'],      // 2° below
    [52, 52, 'pull'],        // at pull
    [55, 52, 'pull'],        // above pull
    [48.9, 52, 'tracking'],  // 3.1° below → tracking
  ];

  it.each(cases)('current=%d, pull=%d → %s', (current, pull, expected) => {
    expect(probeState(current, pull)).toBe(expected);
  });
});
