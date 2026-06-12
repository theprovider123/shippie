import { describe, expect, it } from 'vitest';
import { heatFor, isDimmed, timeAgo } from './heat';

describe('heatFor', () => {
  it('community-sized thresholds: 10 warm, 50 scorching', () => {
    expect(heatFor(0)).toBe('cold');
    expect(heatFor(9)).toBe('cold');
    expect(heatFor(10)).toBe('warm');
    expect(heatFor(49)).toBe('warm');
    expect(heatFor(50)).toBe('scorching');
    expect(heatFor(1247)).toBe('scorching');
  });
});

describe('isDimmed', () => {
  it('dims majority-downvoted takes', () => {
    expect(isDimmed({ up: 1, down: 10 })).toBe(true);
    expect(isDimmed({ up: 10, down: 1 })).toBe(false);
    expect(isDimmed({ up: 0, down: 0 })).toBe(false);
  });
});

describe('timeAgo', () => {
  const now = 1_780_000_000_000;
  it('formats compact relative times', () => {
    expect(timeAgo(now - 30_000, now)).toBe('now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5m');
    expect(timeAgo(now - 2 * 3_600_000, now)).toBe('2h');
    expect(timeAgo(now - 3 * 86_400_000, now)).toBe('3d');
  });
});
