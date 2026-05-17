import { describe, expect, test } from 'vitest';
import {
  buildDailyNarrative,
  buildSevenDayPattern,
  findQuietApps,
} from './narrative';
import type { IntentEvent } from './store';

function ev(appId: string, intent: string, ts: number, row: unknown = {}): IntentEvent {
  return { appId, intent, ts, row };
}

describe('buildDailyNarrative', () => {
  test('empty events → empty narrative', () => {
    const n = buildDailyNarrative([]);
    expect(n.empty).toBe(true);
    expect(n.headline).toBe('Nothing yet today.');
  });

  test('single intent → single-fragment sentence', () => {
    const n = buildDailyNarrative([ev('field-kitchen', 'coffee-brewed', 1000)]);
    expect(n.empty).toBe(false);
    expect(n.fragments).toHaveLength(1);
    expect(n.headline).toContain('1 coffee');
  });

  test('two intents → "X and Y" join', () => {
    const n = buildDailyNarrative([
      ev('coffee', 'coffee-brewed', 1000),
      ev('move', 'workout-completed', 2000),
    ]);
    expect(n.headline).toMatch(/and/);
    expect(n.headline).not.toMatch(/,/);
  });

  test('three intents → comma + "and"', () => {
    const n = buildDailyNarrative([
      ev('coffee', 'coffee-brewed', 1000),
      ev('coffee', 'coffee-brewed', 1100),
      ev('move', 'workout-completed', 2000),
      ev('quiet', 'mindful-session', 3000),
    ]);
    expect(n.headline).toMatch(/, and /);
    expect(n.fragments).toHaveLength(3);
  });

  test('pluralisation works for the heavy hitters', () => {
    const n = buildDailyNarrative([
      ev('coffee', 'coffee-brewed', 1000),
      ev('coffee', 'coffee-brewed', 2000),
      ev('coffee', 'coffee-brewed', 3000),
    ]);
    expect(n.headline).toContain('3 coffees');
    expect(n.headline).not.toContain('3 coffee ');
  });

  test('singular for single occurrences', () => {
    const n = buildDailyNarrative([ev('move', 'workout-completed', 1000)]);
    expect(n.headline).toContain('1 workout');
    expect(n.headline).not.toContain('workouts');
  });

  test('skips unknown intents from the headline (no raw-slug prose)', () => {
    const n = buildDailyNarrative([ev('third-party', 'custom-intent', 1000)]);
    expect(n.empty).toBe(false);
    expect(n.headline).toBe('Some quiet activity today.');
  });

  test('caps at 4 fragments', () => {
    const n = buildDailyNarrative([
      ev('coffee', 'coffee-brewed', 1000),
      ev('move', 'workout-completed', 2000),
      ev('quiet', 'mindful-session', 3000),
      ev('cycle', 'cycle-logged', 4000),
      ev('field-kitchen', 'cooked-meal', 5000),
      ev('field-kitchen', 'hydration-logged', 6000),
    ]);
    expect(n.fragments.length).toBeLessThanOrEqual(4);
  });
});

describe('buildSevenDayPattern', () => {
  test('empty events → empty pattern', () => {
    expect(buildSevenDayPattern([], 1_700_000_000_000)).toEqual([]);
  });

  test('events bucketed by day, ordered oldest → newest', () => {
    const now = 1_700_000_000_000;
    const dayMs = 24 * 60 * 60 * 1000;
    const events = [
      ev('coffee', 'coffee-brewed', now - 6 * dayMs), // 7 days ago, oldest
      ev('coffee', 'coffee-brewed', now - 1 * dayMs), // yesterday
      ev('coffee', 'coffee-brewed', now - 0 * dayMs), // today
      ev('coffee', 'coffee-brewed', now - 0 * dayMs),
    ];
    const pattern = buildSevenDayPattern(events, now);
    expect(pattern).toHaveLength(1);
    expect(pattern[0]!.daily).toEqual([1, 0, 0, 0, 0, 1, 2]);
    expect(pattern[0]!.total).toBe(4);
  });

  test('events older than 7 days are dropped', () => {
    const now = 1_700_000_000_000;
    const dayMs = 24 * 60 * 60 * 1000;
    const events = [
      ev('coffee', 'coffee-brewed', now - 10 * dayMs),
      ev('coffee', 'coffee-brewed', now - 1 * dayMs),
    ];
    const pattern = buildSevenDayPattern(events, now);
    expect(pattern[0]!.total).toBe(1);
  });

  test('most-active app first', () => {
    const now = 1_700_000_000_000;
    const events = [
      ev('quiet', 'mindful-session', now - 100),
      ev('coffee', 'coffee-brewed', now - 200),
      ev('coffee', 'coffee-brewed', now - 300),
      ev('coffee', 'coffee-brewed', now - 400),
    ];
    const pattern = buildSevenDayPattern(events, now);
    expect(pattern[0]!.appId).toBe('coffee');
    expect(pattern[1]!.appId).toBe('quiet');
  });
});

describe('findQuietApps', () => {
  test('apps unused for ≥7 days surface as quiet', () => {
    const now = 1_700_000_000_000;
    const dayMs = 24 * 60 * 60 * 1000;
    const events = [
      ev('coffee', 'coffee-brewed', now - 10 * dayMs),
      ev('move', 'workout-completed', now - 1 * dayMs),
    ];
    const quiet = findQuietApps(events, now);
    expect(quiet.map((q) => q.appId)).toEqual(['coffee']);
    expect(quiet[0]!.daysSinceLastUse).toBe(10);
  });

  test('quiet apps ordered most-quiet-first', () => {
    const now = 1_700_000_000_000;
    const dayMs = 24 * 60 * 60 * 1000;
    const events = [
      ev('coffee', 'coffee-brewed', now - 8 * dayMs),
      ev('move', 'workout-completed', now - 30 * dayMs),
      ev('quiet', 'mindful-session', now - 14 * dayMs),
    ];
    const quiet = findQuietApps(events, now);
    expect(quiet.map((q) => q.appId)).toEqual(['move', 'quiet', 'coffee']);
  });

  test('apps active in the last 7 days are not quiet', () => {
    const now = 1_700_000_000_000;
    const dayMs = 24 * 60 * 60 * 1000;
    const events = [
      ev('coffee', 'coffee-brewed', now - 3 * dayMs),
      ev('move', 'workout-completed', now - 1 * dayMs),
    ];
    expect(findQuietApps(events, now)).toEqual([]);
  });
});
