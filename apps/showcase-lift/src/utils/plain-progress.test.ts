import { describe, expect, it } from 'bun:test';
import { buildProgressSummary } from './plain-progress.ts';
import type { SetRow } from '../db/schema.ts';

function set(weight: number, reps: number, daysAgo: number, id = `s_${weight}_${reps}_${daysAgo}`): SetRow {
  const ts = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return {
    id,
    step_id: 'step_a',
    set_index: 0,
    weight,
    reps,
    unit: 'kg',
    set_type: 'working',
    rpe: null,
    rir: null,
    bar_weight: null,
    plate_inventory_id: null,
    completed_at: ts,
    source: 'manual',
  };
}

describe('buildProgressSummary', () => {
  it('returns honest empty with 0 sets', () => {
    const r = buildProgressSummary({ workingSets: [], unit: 'kg' });
    expect(r.headline).toBe('No clear trend yet. Log 2 more sessions.');
    expect(r.honest).toBe(true);
  });

  it('returns honest empty with 1 set', () => {
    const r = buildProgressSummary({ workingSets: [set(80, 5, 0)], unit: 'kg' });
    expect(r.headline).toBe('No clear trend yet. Log 2 more sessions.');
  });

  it('returns +reps headline when weight constant + reps grew', () => {
    const sets = [set(80, 5, 42), set(80, 8, 0)]; // 42d → ~6 weeks
    const r = buildProgressSummary({ workingSets: sets, unit: 'kg' });
    expect(r.headline).toMatch(/^\+3 reps at 80kg in /);
    expect(r.headline).toContain('week');
  });

  it('uses month framing for spans of 8+ weeks', () => {
    const sets = [set(80, 5, 60), set(80, 8, 0)];
    const r = buildProgressSummary({ workingSets: sets, unit: 'kg' });
    expect(r.headline).toMatch(/^\+3 reps at 80kg in /);
    expect(r.headline).toContain('month');
  });

  it('returns same-reps-more-weight headline', () => {
    const sets = [set(80, 5, 60), set(85, 5, 0)];
    const r = buildProgressSummary({ workingSets: sets, unit: 'kg' });
    expect(r.headline).toMatch(/^Same reps, \+5kg since /);
  });

  it('returns rep-range improvement when neither pure', () => {
    // Same range (4-6), heavier and more reps simultaneously
    const sets = [set(90, 5, 60), set(97.5, 6, 0)];
    const r = buildProgressSummary({ workingSets: sets, unit: 'kg' });
    // The same-reps-more-weight branch only fires when reps are exactly
    // equal — here reps grew too. Falls through to rep-range improvement.
    expect(r.headline).toContain('improved from 90kg to 97.5kg');
  });
});
