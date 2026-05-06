import { describe, expect, test } from 'bun:test';
import {
  defaultStages,
  totalMinutes,
  planFromReady,
  planFromStart,
  positionOnSchedule,
  formatHM,
} from './schedule';

describe('defaultStages', () => {
  test('sourdough includes the starter-feed gate + levain build', () => {
    const stages = defaultStages({ leaven: 'sourdough' });
    expect(stages.find((s) => s.kind === 'feed-starter')).toBeTruthy();
    expect(stages.find((s) => s.kind === 'levain-build')).toBeTruthy();
  });

  test('yeast does NOT include the starter-feed gate', () => {
    const stages = defaultStages({ leaven: 'instant-yeast' });
    expect(stages.find((s) => s.kind === 'feed-starter')).toBeFalsy();
  });

  test('poolish has a long pre-ferment build', () => {
    const stages = defaultStages({ leaven: 'poolish' });
    const pre = stages.find((s) => s.kind === 'levain-build');
    expect(pre).toBeTruthy();
    expect(pre!.minutes).toBeGreaterThanOrEqual(12 * 60);
  });

  test('cold retard appears for sourdough by default and not for yeast', () => {
    const sd = defaultStages({ leaven: 'sourdough' });
    const yeast = defaultStages({ leaven: 'instant-yeast' });
    expect(sd.find((s) => s.kind === 'cold-retard')).toBeTruthy();
    expect(yeast.find((s) => s.kind === 'cold-retard')).toBeFalsy();
    expect(yeast.find((s) => s.kind === 'final-proof')).toBeTruthy();
  });

  test('sourdough bulk has 4 stretch-and-fold sub-prompts', () => {
    const stages = defaultStages({ leaven: 'sourdough' });
    const bulk = stages.find((s) => s.kind === 'bulk-ferment')!;
    expect(bulk.subPrompts?.length).toBe(4);
    expect(bulk.subPrompts![0]!.label).toMatch(/Stretch/i);
  });
});

describe('planFromStart', () => {
  test('first stage starts at the anchor', () => {
    const stages = defaultStages({ leaven: 'instant-yeast' });
    const start = new Date('2026-05-05T08:00:00Z');
    const plan = planFromStart(stages, start);
    expect(plan.stages[0]!.startAt.getTime()).toBe(start.getTime());
    expect(plan.startAt.getTime()).toBe(start.getTime());
  });

  test('readyAt is start + totalMinutes', () => {
    const stages = defaultStages({ leaven: 'instant-yeast' });
    const start = new Date('2026-05-05T08:00:00Z');
    const plan = planFromStart(stages, start);
    expect(plan.readyAt.getTime()).toBe(
      start.getTime() + plan.totalMinutes * 60_000,
    );
  });

  test('sub-prompts have correct absolute fire times', () => {
    const stages = defaultStages({ leaven: 'sourdough' });
    const start = new Date('2026-05-05T08:00:00Z');
    const plan = planFromStart(stages, start);
    // First S&F is at +30m into bulk; bulk follows feed → levain → autolyse → mix.
    const bulkIdx = plan.stages.findIndex((s) => s.kind === 'bulk-ferment');
    const bulkStart = plan.stages[bulkIdx]!.startAt;
    const sf1 = plan.subPrompts.find((sp) => sp.label.includes('#1'))!;
    expect(sf1.fireAt.getTime()).toBe(bulkStart.getTime() + 30 * 60_000);
  });
});

describe('planFromReady', () => {
  test('last stage ends at readyAt (within rounding)', () => {
    const stages = defaultStages({ leaven: 'sourdough' });
    const ready = new Date('2026-05-06T18:00:00Z');
    const plan = planFromReady(stages, ready);
    const last = plan.stages[plan.stages.length - 1]!;
    expect(last.endAt.getTime()).toBe(ready.getTime());
  });

  test('totalMinutes matches sum of stage minutes', () => {
    const stages = defaultStages({ leaven: 'sourdough' });
    const ready = new Date('2026-05-06T18:00:00Z');
    const plan = planFromReady(stages, ready);
    const sum = stages.reduce((acc, s) => acc + s.minutes, 0);
    expect(plan.totalMinutes).toBe(sum);
    expect(totalMinutes(stages)).toBe(sum);
  });
});

describe('positionOnSchedule', () => {
  test('before start returns stageIndex -1', () => {
    const stages = defaultStages({ leaven: 'instant-yeast' });
    const start = new Date('2026-05-05T08:00:00Z');
    const plan = planFromStart(stages, start);
    const pos = positionOnSchedule(plan, new Date('2026-05-05T07:00:00Z'));
    expect(pos.stageIndex).toBe(-1);
    expect(pos.totalProgress).toBe(0);
  });

  test('past readyAt returns stageIndex === stages.length', () => {
    const stages = defaultStages({ leaven: 'instant-yeast' });
    const start = new Date('2026-05-05T08:00:00Z');
    const plan = planFromStart(stages, start);
    const past = new Date(plan.readyAt.getTime() + 60 * 60_000);
    const pos = positionOnSchedule(plan, past);
    expect(pos.stageIndex).toBe(plan.stages.length);
    expect(pos.totalProgress).toBe(1);
  });

  test('mid-bulk returns the bulk stage with sane progress', () => {
    const stages = defaultStages({ leaven: 'sourdough' });
    const start = new Date('2026-05-05T08:00:00Z');
    const plan = planFromStart(stages, start);
    const bulkIdx = plan.stages.findIndex((s) => s.kind === 'bulk-ferment');
    const bulk = plan.stages[bulkIdx]!;
    const mid = new Date(bulk.startAt.getTime() + bulk.minutes * 60_000 * 0.5);
    const pos = positionOnSchedule(plan, mid);
    expect(pos.stageIndex).toBe(bulkIdx);
    expect(pos.stageProgress).toBeCloseTo(0.5, 1);
  });
});

describe('formatHM', () => {
  test('handles minutes < 60', () => {
    expect(formatHM(0)).toBe('0m');
    expect(formatHM(45)).toBe('45m');
  });

  test('handles whole hours', () => {
    expect(formatHM(60)).toBe('1h');
    expect(formatHM(120)).toBe('2h');
  });

  test('handles hours + minutes', () => {
    expect(formatHM(95)).toBe('1h 35m');
  });

  test('handles negative offsets (overrun / past)', () => {
    expect(formatHM(-30)).toBe('-30m');
    expect(formatHM(-90)).toBe('-1h 30m');
  });
});
