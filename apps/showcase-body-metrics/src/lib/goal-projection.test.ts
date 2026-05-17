import { describe, expect, test } from 'bun:test';
import { projectGoal, describeProjection } from './goal-projection.ts';
import type { GoalInput } from './goal-projection.ts';

function span(days: number, fn: (i: number) => number, startYmd = '2026-04-01') {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(`${startYmd}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), weightKg: fn(i) };
  });
}

const NOW = new Date('2026-04-15T12:00:00Z');

const GOAL_LOSS: GoalInput = {
  startDate: '2026-04-01',
  startWeightKg: 80,
  weightKg: 75,
  targetDate: '2026-08-01',
};

describe('projectGoal', () => {
  test('insufficient data without measurements', () => {
    const p = projectGoal(GOAL_LOSS, [], NOW);
    expect(p.status).toBe('insufficient-data');
    expect(p.currentWeightKg).toBeNull();
  });

  test('insufficient data with fewer than 7 measurements', () => {
    const p = projectGoal(GOAL_LOSS, span(5, (i) => 80 - i * 0.1), NOW);
    expect(p.status).toBe('insufficient-data');
    // Still computes required delta against last weight.
    expect(p.requiredDeltaKg).toBeCloseTo(75 - 79.6, 1);
  });

  test('on-track when pace lands near target date', () => {
    // Goal: lose 5 kg in ~108 days. Need ~-0.046 kg/day = ~-0.32 kg/week.
    // Provide a 14-day series losing ~0.046 kg/day.
    const p = projectGoal(
      GOAL_LOSS,
      span(14, (i) => 80 - i * 0.046),
      NOW,
    );
    expect(['on-track', 'ahead']).toContain(p.status);
    expect(p.projectedHitDate).not.toBeNull();
  });

  test('behind when pace is too slow', () => {
    // Lose only 0.005 kg/day → ~-0.035 kg/week. Way too slow for -5 kg
    // in ~108 days.
    const p = projectGoal(GOAL_LOSS, span(14, (i) => 80 - i * 0.005), NOW);
    expect(p.status).toBe('behind');
  });

  test('wrong-direction when trend is up but goal is below', () => {
    const p = projectGoal(GOAL_LOSS, span(14, (i) => 80 + i * 0.1), NOW);
    expect(p.status).toBe('wrong-direction');
  });

  test('ahead when pace is faster than required', () => {
    // Lose 0.2 kg/day = 1.4 kg/week — way faster than required.
    const p = projectGoal(GOAL_LOSS, span(14, (i) => 80 - i * 0.2), NOW);
    expect(p.status).toBe('ahead');
    expect(p.projectedHitDate).not.toBeNull();
  });
});

describe('describeProjection', () => {
  test('insufficient-data without weight prompts user to log', () => {
    const text = describeProjection(
      projectGoal(GOAL_LOSS, [], NOW),
      GOAL_LOSS,
    );
    expect(text.toLowerCase()).toContain('log');
  });

  test('on-track copy mentions target weight', () => {
    const p = projectGoal(GOAL_LOSS, span(14, (i) => 80 - i * 0.046), NOW);
    const text = describeProjection(p, GOAL_LOSS);
    expect(text).toContain('75.0 kg');
  });

  test('voice avoids "crush" / "transformation"', () => {
    const samples = [
      describeProjection(projectGoal(GOAL_LOSS, span(14, (i) => 80 - i * 0.2), NOW), GOAL_LOSS),
      describeProjection(projectGoal(GOAL_LOSS, span(14, (i) => 80 + i * 0.1), NOW), GOAL_LOSS),
      describeProjection(projectGoal(GOAL_LOSS, span(14, (i) => 80 - i * 0.005), NOW), GOAL_LOSS),
    ];
    for (const text of samples) {
      expect(text.toLowerCase()).not.toContain('crush');
      expect(text.toLowerCase()).not.toContain('transformation');
      expect(text.toLowerCase()).not.toContain('smash');
    }
  });
});
