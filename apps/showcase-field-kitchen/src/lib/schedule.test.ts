import { describe, expect, it } from 'bun:test';
import {
  buildSchedule,
  clampColdHours,
  COLD_HOURS_MAX,
  COLD_HOURS_MIN,
} from './schedule.ts';

describe('clampColdHours', () => {
  it('clamps the upper bound', () => {
    expect(clampColdHours(1000)).toBe(COLD_HOURS_MAX);
  });

  it('clamps the lower bound', () => {
    expect(clampColdHours(-5)).toBe(COLD_HOURS_MIN);
  });

  it('rounds to a tenth of an hour', () => {
    expect(clampColdHours(8.456)).toBe(8.5);
  });

  it('falls back on garbage', () => {
    expect(clampColdHours('soon-ish')).toBe(12);
  });
});

describe('buildSchedule', () => {
  const start = new Date('2026-05-05T17:00:00.000Z');

  it('emits all six steps in order', () => {
    const steps = buildSchedule({ start, cold_hours: 12 });
    expect(steps.map((s) => s.key)).toEqual([
      'mix',
      'fold-1',
      'fold-2',
      'shape',
      'cold-rest',
      'bake',
    ]);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.at.getTime()).toBeGreaterThanOrEqual(steps[i - 1]!.at.getTime());
    }
  });

  it('places the bake step at start + cold_hours', () => {
    const steps = buildSchedule({ start, cold_hours: 8 });
    const bake = steps.find((s) => s.key === 'bake')!;
    expect(bake.at.getTime() - start.getTime()).toBe(8 * 3_600_000);
  });

  it('mix step is exactly the start time', () => {
    const steps = buildSchedule({ start, cold_hours: 12 });
    expect(steps[0]!.at.getTime()).toBe(start.getTime());
  });

  it('every step has a hint and label', () => {
    const steps = buildSchedule({ start, cold_hours: 12 });
    for (const step of steps) {
      expect(step.label.length).toBeGreaterThan(0);
      expect(step.hint.length).toBeGreaterThan(0);
    }
  });
});
