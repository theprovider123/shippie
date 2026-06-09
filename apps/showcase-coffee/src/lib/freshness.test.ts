import { describe, expect, it } from 'bun:test';
import { daysSince, freshness, peakWindow } from './freshness.ts';

const NOW = new Date('2026-06-08T12:00:00Z');

function roastedDaysAgo(days: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

describe('peakWindow', () => {
  it('uses roast-level windows', () => {
    expect(peakWindow('light')).toEqual([10, 28]);
    expect(peakWindow('medium')).toEqual([7, 21]);
    expect(peakWindow('dark')).toEqual([5, 14]);
  });

  it('shifts both ends +5 for espresso', () => {
    expect(peakWindow('medium', 'espresso')).toEqual([12, 26]);
    expect(peakWindow('dark', 'espresso')).toEqual([10, 19]);
  });

  it('does not shift for non-espresso methods', () => {
    expect(peakWindow('medium', 'v60')).toEqual([7, 21]);
  });
});

describe('daysSince', () => {
  it('counts whole days', () => {
    expect(daysSince(roastedDaysAgo(12), NOW)).toBe(12);
    expect(daysSince(roastedDaysAgo(0), NOW)).toBe(0);
  });

  it('clamps future dates to 0', () => {
    expect(daysSince(roastedDaysAgo(-5), NOW)).toBe(0);
  });

  it('returns 0 for an unparseable date', () => {
    expect(daysSince('not-a-date', NOW)).toBe(0);
  });
});

describe('freshness', () => {
  it('reports resting before the window', () => {
    const f = freshness({ roastDate: roastedDaysAgo(3), roastLevel: 'medium', now: NOW });
    expect(f.status).toBe('too-fresh');
    expect(f.label).toBe('Resting');
    expect(f.daysOffRoast).toBe(3);
  });

  it('reports approaching peak just before the window opens', () => {
    const f = freshness({ roastDate: roastedDaysAgo(6), roastLevel: 'medium', now: NOW });
    expect(f.status).toBe('approaching-peak');
    expect(f.label).toBe('Almost');
  });

  it('reports at-peak inside the window', () => {
    const f = freshness({ roastDate: roastedDaysAgo(12), roastLevel: 'medium', now: NOW });
    expect(f.status).toBe('at-peak');
    expect(f.window).toEqual([7, 21]);
  });

  it('reports fading past the window', () => {
    const f = freshness({ roastDate: roastedDaysAgo(24), roastLevel: 'medium', now: NOW });
    expect(f.status).toBe('past-peak');
    expect(f.label).toBe('Fading');
  });

  it('honours the espresso shift', () => {
    const espresso = freshness({ roastDate: roastedDaysAgo(18), roastLevel: 'dark', method: 'espresso', now: NOW });
    expect(espresso.window).toEqual([10, 19]);
    expect(espresso.status).toBe('at-peak');
    const filter = freshness({ roastDate: roastedDaysAgo(18), roastLevel: 'dark', now: NOW });
    expect(filter.status).toBe('past-peak');
  });

  it('degrades gracefully with no roast date', () => {
    const f = freshness({ roastLevel: 'light' });
    expect(f.dated).toBe(false);
    expect(f.label).toBe('No date');
    expect(f.window).toEqual([10, 28]);
  });
});
