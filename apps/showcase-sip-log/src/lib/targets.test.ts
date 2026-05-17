import { describe, expect, test } from 'bun:test';
import {
  caffeineStatus,
  hydrationProgress,
  last7Days,
  streakDaysMetTarget,
} from './targets';
import { DEFAULT_TARGETS, todayKey, type Sip, type Targets } from '../db';

const T: Targets = { ...DEFAULT_TARGETS };

const sip = (overrides: Partial<Sip> = {}): Sip => ({
  id: overrides.id ?? 's',
  kind: overrides.kind ?? 'water',
  ml: overrides.ml ?? 250,
  mg: overrides.mg ?? 0,
  logged_at: overrides.logged_at ?? new Date().toISOString(),
});

describe('targets — hydration progress', () => {
  test('sums today ml and reports remaining', () => {
    const today = todayKey();
    const sips: Sip[] = [
      sip({ id: 'a', ml: 250, logged_at: new Date().toISOString() }),
      sip({ id: 'b', ml: 500, logged_at: new Date().toISOString() }),
    ];
    const p = hydrationProgress(sips, T, today);
    expect(p.ml).toBe(750);
    expect(p.target_ml).toBe(2000);
    expect(p.remaining_ml).toBe(1250);
    expect(p.met).toBe(false);
    expect(p.pct).toBeCloseTo(0.375, 3);
  });

  test('caps pct at 1 once over target and reports met=true', () => {
    const today = todayKey();
    const sips: Sip[] = [
      sip({ id: 'a', ml: 3000, logged_at: new Date().toISOString() }),
    ];
    const p = hydrationProgress(sips, T, today);
    expect(p.pct).toBe(1);
    expect(p.met).toBe(true);
    expect(p.remaining_ml).toBe(0);
  });

  test('ignores sips outside the target day', () => {
    const today = todayKey();
    const sips: Sip[] = [
      sip({ id: 'a', ml: 250, logged_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }),
    ];
    const p = hydrationProgress(sips, T, today);
    expect(p.ml).toBe(0);
  });
});

describe('targets — caffeine status', () => {
  test('sums caffeine for the day and flags past-cutoff', () => {
    const day = todayKey();
    const morning = new Date();
    morning.setHours(9, 0, 0, 0);
    const afternoon = new Date();
    afternoon.setHours(15, 30, 0, 0);
    const sips: Sip[] = [
      sip({ id: 'a', kind: 'coffee-mug', ml: 240, mg: 95, logged_at: morning.toISOString() }),
      sip({ id: 'b', kind: 'coffee-mug', ml: 240, mg: 95, logged_at: afternoon.toISOString() }),
    ];
    const status = caffeineStatus(sips, T, day);
    expect(status.mg).toBe(190);
    expect(status.past_cutoff_mg).toBe(95);
    expect(status.past_cutoff).toBe(true);
    expect(status.over_cap).toBe(false);
  });

  test('flags over_cap when daily intake exceeds the ceiling', () => {
    const day = todayKey();
    const sips: Sip[] = Array.from({ length: 5 }).map((_, i) =>
      sip({ id: `c${i}`, kind: 'coffee-mug', ml: 240, mg: 95, logged_at: new Date().toISOString() }),
    );
    const status = caffeineStatus(sips, T, day);
    expect(status.mg).toBe(475);
    expect(status.over_cap).toBe(true);
  });
});

describe('targets — streak', () => {
  function isoForDaysAgo(days: number, hour = 12): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  }

  test('counts today + consecutive prior days that hit the target', () => {
    const sips: Sip[] = [
      sip({ id: 'd0', ml: 2000, logged_at: isoForDaysAgo(0) }),
      sip({ id: 'd1', ml: 2000, logged_at: isoForDaysAgo(1) }),
      sip({ id: 'd2', ml: 2000, logged_at: isoForDaysAgo(2) }),
    ];
    expect(streakDaysMetTarget(sips, T)).toBe(3);
  });

  test('today not yet met counts the streak ending yesterday', () => {
    const sips: Sip[] = [
      // Today: only 500ml (short).
      sip({ id: 'd0', ml: 500, logged_at: isoForDaysAgo(0) }),
      // Yesterday + 2 days ago hit target.
      sip({ id: 'd1', ml: 2000, logged_at: isoForDaysAgo(1) }),
      sip({ id: 'd2', ml: 2000, logged_at: isoForDaysAgo(2) }),
    ];
    expect(streakDaysMetTarget(sips, T)).toBe(2);
  });

  test('breaks at first missed day', () => {
    const sips: Sip[] = [
      sip({ id: 'd0', ml: 2000, logged_at: isoForDaysAgo(0) }),
      sip({ id: 'd1', ml: 500, logged_at: isoForDaysAgo(1) }),
      sip({ id: 'd2', ml: 2000, logged_at: isoForDaysAgo(2) }),
    ];
    expect(streakDaysMetTarget(sips, T)).toBe(1);
  });

  test('returns 0 when neither today nor yesterday met the target', () => {
    const sips: Sip[] = [
      sip({ id: 'd0', ml: 100, logged_at: isoForDaysAgo(0) }),
      sip({ id: 'd1', ml: 100, logged_at: isoForDaysAgo(1) }),
    ];
    expect(streakDaysMetTarget(sips, T)).toBe(0);
  });
});

describe('targets — last7Days', () => {
  test('returns 7 days oldest-first with bucketed totals', () => {
    const sips: Sip[] = [
      sip({ id: 'a', ml: 250, logged_at: new Date().toISOString() }),
      sip({
        id: 'b',
        ml: 500,
        logged_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ];
    const days = last7Days(sips);
    expect(days).toHaveLength(7);
    expect(days[6]?.ml).toBe(250); // today is last
    expect(days[3]?.ml).toBe(500); // 3 days ago is index 3
  });
});
