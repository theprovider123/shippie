import { describe, expect, test } from 'bun:test';
import {
  CUTS,
  DONENESS_TEMP_C,
  computeCookMinutes,
  formatDuration,
} from './data';

describe('cooking lookup', () => {
  test('every cut declares at least one method with timing', () => {
    for (const c of CUTS) {
      expect(c.methods.length).toBeGreaterThan(0);
      // Every declared method should have timing
      for (const m of c.methods) {
        expect(c.timing[m]).toBeTruthy();
      }
    }
  });

  test('doneness temps go up with doneness', () => {
    expect(DONENESS_TEMP_C.rare).toBeLessThan(DONENESS_TEMP_C['med-rare']);
    expect(DONENESS_TEMP_C['med-rare']).toBeLessThan(DONENESS_TEMP_C.medium);
    expect(DONENESS_TEMP_C.medium).toBeLessThan(DONENESS_TEMP_C['med-well']);
    expect(DONENESS_TEMP_C['med-well']).toBeLessThan(DONENESS_TEMP_C['well-done']);
  });

  test('computeCookMinutes scales by weight when minutes_per_kg is set', () => {
    const brisket = CUTS.find((c) => c.id === 'beef-brisket')!;
    expect(brisket.timing.smoke?.minutes_per_kg).toBeGreaterThan(0);
    const m1 = computeCookMinutes(brisket, 'smoke', 1);
    const m4 = computeCookMinutes(brisket, 'smoke', 4);
    expect(m4).toBeGreaterThan(m1!);
  });

  test('computeCookMinutes returns null when method does not apply', () => {
    const brisket = CUTS.find((c) => c.id === 'beef-brisket')!;
    expect(computeCookMinutes(brisket, 'pan', 1)).toBeNull();
  });

  test('formatDuration handles minutes and hours', () => {
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(95)).toBe('1h 35m');
    expect(formatDuration(180)).toBe('3h');
  });
});
