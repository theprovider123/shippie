import { describe, expect, test } from 'bun:test';
import {
  CUTS,
  DONENESS_TEMP_C,
  TEMP_CARD,
  WOOD_PAIRINGS,
  computeCookMinutes,
  formatClock,
  formatDuration,
  tempCardFor,
  woodPairingFor,
} from './data';
import { classifyWood, pairingFor } from './lib/wood-pairing';

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

  test('every cut declares a protein family', () => {
    for (const c of CUTS) {
      expect(['beef', 'pork', 'poultry', 'fish', 'lamb']).toContain(c.protein);
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

  test('formatClock renders MM:SS under one hour and H:MM:SS over', () => {
    expect(formatClock(45)).toBe('0:45');
    expect(formatClock(125)).toBe('2:05');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(-30)).toBe('0:00');
  });

  test('TEMP_CARD: safe ≥ ideal in every row except where lower-temp doneness is the goal', () => {
    for (const e of TEMP_CARD) {
      expect(e.safe_c).toBeGreaterThan(0);
      expect(e.ideal_c).toBeGreaterThan(0);
    }
  });

  test('tempCardFor: every cut maps to a temp-card row', () => {
    for (const cut of CUTS) {
      const entry = tempCardFor(cut);
      expect(entry).not.toBeNull();
    }
  });

  test('woodPairingFor: every protein family resolves', () => {
    expect(woodPairingFor('beef').best.length).toBeGreaterThan(0);
    expect(woodPairingFor('pork').best.length).toBeGreaterThan(0);
    expect(woodPairingFor('poultry').best.length).toBeGreaterThan(0);
    expect(woodPairingFor('fish').best.length).toBeGreaterThan(0);
    expect(woodPairingFor('lamb').best.length).toBeGreaterThan(0);
  });

  test('WOOD_PAIRINGS covers every protein once', () => {
    const proteins = WOOD_PAIRINGS.map((w) => w.protein);
    expect(new Set(proteins).size).toBe(proteins.length);
  });

  test('classifyWood: hickory on beef is best, mesquite on fish is avoid', () => {
    expect(classifyWood('beef', 'hickory')).toBe('best');
    expect(classifyWood('beef', 'oak')).toBe('best');
    expect(classifyWood('fish', 'mesquite')).toBe('avoid');
    expect(classifyWood('pork', 'apple')).toBe('best');
  });

  test('classifyWood: empty input is unknown', () => {
    expect(classifyWood('beef', '')).toBe('unknown');
    expect(classifyWood('beef', 'martian dust')).toBe('unknown');
  });

  test('pairingFor matches woodPairingFor', () => {
    expect(pairingFor('beef')).toBe(woodPairingFor('beef'));
  });
});
