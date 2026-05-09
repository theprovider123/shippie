import { describe, expect, it } from 'bun:test';
import { evaluateStrain } from './strain.ts';
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

describe('evaluateStrain', () => {
  it('returns insufficient-data when no working sets', () => {
    const r = evaluateStrain({ workingSets: [] });
    expect(r.honest).toBe(false);
    expect(r.recommendDeload).toBe(false);
  });

  it('returns insufficient-data when only recent sets', () => {
    const r = evaluateStrain({
      workingSets: [set(80, 5, 3), set(80, 5, 10)],
    });
    expect(r.honest).toBe(false);
    expect(r.recommendDeload).toBe(false);
  });

  it('flags deload when 4-week ramp > 25%', () => {
    // Prior 4 weeks: 80kg × 5 × 4 sessions = 1600
    // Recent 4 weeks: 100kg × 5 × 5 sessions = 2500 → ratio 1.5625
    const prior = [
      set(80, 5, 50),
      set(80, 5, 45),
      set(80, 5, 40),
      set(80, 5, 35),
    ];
    const recent = [
      set(100, 5, 25),
      set(100, 5, 20),
      set(100, 5, 15),
      set(100, 5, 10),
      set(100, 5, 5),
    ];
    const r = evaluateStrain({ workingSets: [...prior, ...recent] });
    expect(r.recommendDeload).toBe(true);
    expect(r.reason).toContain('Consider a deload');
  });

  it('does NOT flag when ramp < 25%', () => {
    const prior = [set(80, 5, 50), set(80, 5, 40), set(80, 5, 35)];
    const recent = [set(85, 5, 25), set(85, 5, 15), set(85, 5, 5)];
    const r = evaluateStrain({ workingSets: [...prior, ...recent] });
    expect(r.recommendDeload).toBe(false);
    expect(r.honest).toBe(true);
  });

  it('reports volume down when recent < prior', () => {
    const prior = [set(80, 5, 50), set(80, 5, 40), set(80, 5, 35)];
    const recent = [set(80, 3, 25), set(80, 3, 15)];
    const r = evaluateStrain({ workingSets: [...prior, ...recent] });
    expect(r.recommendDeload).toBe(false);
    expect(r.reason).toContain('down');
  });

  it('ignores warmup sets', () => {
    const prior = [
      { ...set(80, 5, 50), set_type: 'warmup' as const },
      { ...set(80, 5, 40), set_type: 'warmup' as const },
    ];
    const recent = [set(100, 5, 5)];
    const r = evaluateStrain({ workingSets: [...prior, ...recent] });
    // priorTonnage = 0 because warmups are filtered → honest:false
    expect(r.honest).toBe(false);
  });
});
