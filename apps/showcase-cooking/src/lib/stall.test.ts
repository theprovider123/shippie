import { describe, expect, test } from 'bun:test';
import {
  classifyStall,
  estimateStallHoursRemaining,
  STALL_RANGE_C,
} from './stall.ts';

describe('stall classifier', () => {
  test('pre-stall: classifies cuts climbing toward the stall', () => {
    const r = classifyStall(55);
    expect(r.stage).toBe('pre-stall');
    if (r.stage === 'pre-stall') {
      expect(r.until_c).toBe(STALL_RANGE_C[0]);
      expect(r.advice).toContain(`${STALL_RANGE_C[0]}`);
    }
  });

  test('stall: identifies in-band internal-temp', () => {
    const r = classifyStall(70, 0.5);
    expect(r.stage).toBe('stall');
    if (r.stage === 'stall') {
      expect(r.choice).toBe('ride'); // <1h in stall → ride
    }
  });

  test('stall: after 2h+ in band, advice flips to wrap', () => {
    const r = classifyStall(72, 2.5);
    expect(r.stage).toBe('stall');
    if (r.stage === 'stall') {
      expect(r.choice).toBe('wrap');
      expect(r.advice.toLowerCase()).toContain('wrap');
    }
  });

  test('stall: 1–2h is the indecision band', () => {
    const r = classifyStall(70, 1.5);
    expect(r.stage).toBe('stall');
    if (r.stage === 'stall') {
      expect(r.choice).toBe('either');
    }
  });

  test('post-stall: above the upper bound is climb-fast territory', () => {
    const r = classifyStall(85);
    expect(r.stage).toBe('post-stall');
  });

  test('estimateStallHoursRemaining: nullable outside stall', () => {
    expect(estimateStallHoursRemaining(50)).toBeNull();
    expect(estimateStallHoursRemaining(90)).toBeNull();
  });

  test('estimateStallHoursRemaining: ~3°C/hour rate at the low end of stall', () => {
    const hours = estimateStallHoursRemaining(STALL_RANGE_C[0]);
    expect(hours).toBeGreaterThan(0);
    // (77 - 65) / 3 ≈ 4.0
    expect(hours).toBeCloseTo(4.0, 1);
  });
});
