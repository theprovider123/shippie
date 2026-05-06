import { describe, expect, test } from 'bun:test';
import { estimateCarryover } from './carryover.ts';

describe('carryover estimator', () => {
  test('sous-vide: zero carryover, no rest', () => {
    const c = estimateCarryover('sous-vide', 60, 1);
    expect(c.rise_c).toBe(0);
    expect(c.pull_at_c).toBe(60);
    expect(c.rest_minutes).toBe(0);
  });

  test('smoke: small rise, long rest scales with size', () => {
    const small = estimateCarryover('smoke', 93, 2);
    const big = estimateCarryover('smoke', 93, 5);
    expect(small.rise_c).toBe(2);
    expect(small.rest_minutes).toBe(30);
    expect(big.rest_minutes).toBe(60);
  });

  test('pan: ~2°C bump on a thin cut, 4 min rest', () => {
    const c = estimateCarryover('pan', 56, null);
    expect(c.rise_c).toBe(2);
    expect(c.pull_at_c).toBe(54);
    expect(c.rest_minutes).toBe(4);
  });

  test('grill: same shape as pan for thin cuts', () => {
    const c = estimateCarryover('grill', 56, null);
    expect(c.rise_c).toBe(2);
    expect(c.rest_minutes).toBe(4);
  });

  test('roast: rise scales with weight (small / mid / large)', () => {
    const small = estimateCarryover('roast', 60, 1.0);
    const mid = estimateCarryover('roast', 60, 2.0);
    const big = estimateCarryover('roast', 60, 5.0);
    expect(small.rise_c).toBe(3);
    expect(mid.rise_c).toBe(5);
    expect(big.rise_c).toBe(7);
    expect(big.rest_minutes).toBeGreaterThan(small.rest_minutes);
  });

  test('roast: pull_at = target - rise', () => {
    const c = estimateCarryover('roast', 60, 2);
    expect(c.pull_at_c).toBe(60 - c.rise_c);
  });

  test('roast: missing weight defaults to mid-size assumptions', () => {
    const c = estimateCarryover('roast', 60, null);
    // Default 1.5 kg → mid bracket → 5°C rise
    expect(c.rise_c).toBe(5);
  });
});
