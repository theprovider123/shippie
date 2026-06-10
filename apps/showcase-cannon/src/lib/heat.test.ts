import { describe, expect, it } from 'vitest';
import { heatFor, isDimmed, timeAgo } from './heat';
import { SEED_TAKES } from '../data/takes-seed';

describe('heat derivation', () => {
  it('reproduces the design seed states exactly', () => {
    const expected: Record<string, string> = {
      'seed-1': 'scorching',
      'seed-2': 'scorching',
      'seed-3': 'warm',
      'seed-4': 'cold',
      'seed-5': 'warm',
      'seed-6': 'scorching',
      'seed-7': 'warm',
    };
    for (const t of SEED_TAKES) expect(heatFor(t.up)).toBe(expected[t.id]);
  });

  it('fresh takes start cold and climb', () => {
    expect(heatFor(0)).toBe('cold');
    expect(heatFor(399)).toBe('cold');
    expect(heatFor(400)).toBe('warm');
    expect(heatFor(1000)).toBe('scorching');
  });

  it('dims majority-downvoted takes only', () => {
    expect(isDimmed({ up: 234, down: 312 })).toBe(true);
    expect(isDimmed({ up: 1247, down: 34 })).toBe(false);
    expect(isDimmed({ up: 0, down: 0 })).toBe(false);
    expect(isDimmed({ up: 0, down: 2 })).toBe(true);
  });

  it('formats relative time in the design beats', () => {
    const now = 1_000_000_000_000;
    expect(timeAgo(now - 5_000, now)).toBe('now');
    expect(timeAgo(now - 8 * 60_000, now)).toBe('8m');
    expect(timeAgo(now - 2 * 3_600_000, now)).toBe('2h');
    expect(timeAgo(now - 3 * 86_400_000, now)).toBe('3d');
    expect(timeAgo(now + 60_000, now)).toBe('now');
  });
});
