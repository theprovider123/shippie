import { describe, expect, test } from 'bun:test';
import { breathOnLowMoodStrategy } from './breath-on-low-mood.ts';
import type { AgentContext, AgentRow } from '../types.ts';

const NOW = new Date('2026-05-04T20:00:00').getTime();

const moodApp = {
  slug: 'mood-pulse',
  name: 'Mood Pulse',
  provides: ['mood-logged'],
} as const;
const breathApp = {
  slug: 'breath',
  name: 'Breath',
  provides: ['mindful-session'],
} as const;
const pomodoroApp = {
  slug: 'pomodoro',
  name: 'Pomodoro',
  provides: ['focus-session'],
} as const;

function moodRow(score: number, hoursAgo = 1): AgentRow {
  return {
    appSlug: 'mood-pulse',
    table: 'moods',
    payload: { score, logged_at: new Date(NOW - hoursAgo * 60 * 60 * 1000).toISOString() },
    createdAt: NOW - hoursAgo * 60 * 60 * 1000,
  };
}

function ctx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    now: NOW,
    apps: [moodApp, breathApp],
    rows: [],
    ...overrides,
  };
}

describe('breathOnLowMoodStrategy', () => {
  test('silent without mood-pulse', () => {
    expect(breathOnLowMoodStrategy.evaluate(ctx({ apps: [breathApp] }))).toEqual([]);
  });

  test('silent on a neutral day (score 3)', () => {
    expect(breathOnLowMoodStrategy.evaluate(ctx({ rows: [moodRow(3)] }))).toEqual([]);
  });

  test('silent on a good day (score 4)', () => {
    expect(breathOnLowMoodStrategy.evaluate(ctx({ rows: [moodRow(4)] }))).toEqual([]);
  });

  test('fires on a low day (score 2)', () => {
    const out = breathOnLowMoodStrategy.evaluate(ctx({ rows: [moodRow(2)] }));
    expect(out).toHaveLength(1);
    expect(out[0]?.urgency).toBe('low');
    expect(out[0]?.target.app).toBe('breath');
  });

  test('escalates to medium urgency on a rough day (score 1)', () => {
    const out = breathOnLowMoodStrategy.evaluate(ctx({ rows: [moodRow(1)] }));
    expect(out[0]?.urgency).toBe('medium');
  });

  test('falls back to pomodoro when breath is not installed', () => {
    const out = breathOnLowMoodStrategy.evaluate(
      ctx({ apps: [moodApp, pomodoroApp], rows: [moodRow(2)] }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.target.app).toBe('pomodoro');
    expect(out[0]?.body).toContain('box-breath');
  });

  test('silent when no breath / pomodoro app exists', () => {
    const out = breathOnLowMoodStrategy.evaluate(
      ctx({ apps: [moodApp], rows: [moodRow(2)] }),
    );
    expect(out).toEqual([]);
  });

  test('insight id is stable across same-day re-ticks', () => {
    const a = breathOnLowMoodStrategy.evaluate(ctx({ rows: [moodRow(2)] }));
    const b = breathOnLowMoodStrategy.evaluate(ctx({ rows: [moodRow(2)] }));
    expect(a[0]?.id).toBe(b[0]?.id);
  });
});
