import { describe, expect, it } from 'bun:test';
import { computeTrainingLoad } from './training-load.ts';
import type { SetRow } from '../db/schema.ts';

const NOW = Date.parse('2026-05-29T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function set(opts: {
  weight: number;
  reps: number;
  daysAgo: number;
  rpe?: number;
  type?: SetRow['set_type'];
  id?: string;
}): SetRow {
  return {
    id: opts.id ?? `s_${opts.weight}_${opts.reps}_${opts.daysAgo}`,
    step_id: 'step',
    set_index: 0,
    weight: opts.weight,
    reps: opts.reps,
    unit: 'kg',
    set_type: opts.type ?? 'working',
    rpe: opts.rpe ?? null,
    rir: null,
    bar_weight: 20,
    plate_inventory_id: null,
    completed_at: new Date(NOW - opts.daysAgo * DAY).toISOString(),
    source: 'manual',
  };
}

describe('computeTrainingLoad', () => {
  it('is honest with no chronic base', () => {
    const r = computeTrainingLoad({ workingSets: [], now: NOW });
    expect(r.acwr).toBeNull();
    expect(r.honest).toBe(false);
    expect(r.recommendDeload).toBe(false);
  });

  it('reports a productive ratio when this week matches the 4-week average', () => {
    // Even tonnage every week for 4 weeks → acute ≈ chronic-weekly → ACWR ≈ 1.
    const sets: SetRow[] = [];
    for (let week = 0; week < 4; week++) {
      sets.push(set({ weight: 100, reps: 10, daysAgo: week * 7 + 1, id: `w${week}` }));
    }
    const r = computeTrainingLoad({ workingSets: sets, now: NOW });
    expect(r.honest).toBe(true);
    expect(r.acwr).toBeCloseTo(1, 1);
    expect(r.band).toBe('productive');
    expect(r.recommendDeload).toBe(false);
  });

  it('flags overreaching and recommends a deload when this week spikes', () => {
    const sets: SetRow[] = [];
    // Small base in the older 3 weeks.
    for (let week = 1; week < 4; week++) {
      sets.push(set({ weight: 50, reps: 5, daysAgo: week * 7 + 1, id: `base${week}` }));
    }
    // Huge acute week.
    sets.push(set({ weight: 200, reps: 10, daysAgo: 1, id: 'spike1' }));
    sets.push(set({ weight: 200, reps: 10, daysAgo: 2, id: 'spike2' }));
    const r = computeTrainingLoad({ workingSets: sets, now: NOW });
    expect(r.acwr!).toBeGreaterThan(1.5);
    expect(r.band).toBe('overreaching');
    expect(r.recommendDeload).toBe(true);
  });

  it('reports detraining when the acute week is far below average', () => {
    const sets: SetRow[] = [];
    // Heavy older weeks build a high chronic base.
    for (let week = 1; week < 4; week++) {
      sets.push(set({ weight: 200, reps: 10, daysAgo: week * 7 + 1, id: `heavy${week}` }));
    }
    // Tiny acute week.
    sets.push(set({ weight: 20, reps: 5, daysAgo: 1, id: 'light' }));
    const r = computeTrainingLoad({ workingSets: sets, now: NOW });
    expect(r.acwr!).toBeLessThan(0.8);
    expect(r.band).toBe('detraining');
  });

  it('scales session load by RPE but keeps plain tonnage too', () => {
    const session = [set({ weight: 100, reps: 10, daysAgo: 0, rpe: 8 })];
    const r = computeTrainingLoad({ workingSets: session, sessionSets: session, now: NOW });
    expect(r.sessionTonnage).toBe(1000);
    expect(r.sessionLoad).toBe(800); // 100*10*0.8
  });

  it('falls back to tonnage for session load when RPE is absent', () => {
    const session = [set({ weight: 100, reps: 10, daysAgo: 0 })];
    const r = computeTrainingLoad({ workingSets: session, sessionSets: session, now: NOW });
    expect(r.sessionLoad).toBe(r.sessionTonnage);
  });

  it('excludes warmups from tonnage', () => {
    const session = [
      set({ weight: 40, reps: 10, daysAgo: 0, type: 'warmup', id: 'warm' }),
      set({ weight: 100, reps: 5, daysAgo: 0, id: 'work' }),
    ];
    const r = computeTrainingLoad({ workingSets: session, sessionSets: session, now: NOW });
    expect(r.sessionTonnage).toBe(500);
  });
});
