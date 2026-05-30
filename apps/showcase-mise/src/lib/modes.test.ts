import { describe, expect, test } from 'bun:test';
import { MODES, modeMeta, targetsForMode } from './modes';

describe('targetsForMode', () => {
  test('produces positive, coherent targets', () => {
    const t = targetsForMode('maintenance', 70);
    expect(t.kcal).toBeGreaterThan(0);
    expect(t.protein_g).toBeGreaterThan(0);
    expect(t.carb_g).toBeGreaterThan(0);
    expect(t.fat_g).toBeGreaterThan(0);
    expect(t.protein_per_meal_g).toBeGreaterThanOrEqual(20);
  });

  test('protein scales with bodyweight', () => {
    expect(targetsForMode('maintenance', 100).protein_g).toBeGreaterThan(
      targetsForMode('maintenance', 70).protein_g,
    );
  });

  test('muscle-gain wants more protein than maintenance at the same weight', () => {
    expect(targetsForMode('muscle-gain', 80).protein_g).toBeGreaterThan(
      targetsForMode('maintenance', 80).protein_g,
    );
  });

  test('fat-loss sits in a deficit vs maintenance', () => {
    expect(targetsForMode('fat-loss', 80).kcal).toBeLessThan(targetsForMode('maintenance', 80).kcal);
  });

  test('endurance is carb-forward and better hydrated', () => {
    const end = targetsForMode('endurance', 75);
    const maint = targetsForMode('maintenance', 75);
    expect(end.carb_g).toBeGreaterThan(maint.carb_g);
    expect(end.water_ml).toBeGreaterThan(maint.water_ml);
    expect(end.caffeine_cutoff_hour).toBe(16);
  });

  test('watch modes move the right line', () => {
    expect(targetsForMode('sodium-watch', 70).sodium_mg).toBe(1500);
    expect(targetsForMode('fiber-watch', 70).fiber_g).toBe(40);
    expect(targetsForMode('cycle-aware', 70).caffeine_mg).toBe(300);
  });

  test('unknown bodyweight falls back to a default', () => {
    expect(targetsForMode('maintenance').protein_g).toBe(targetsForMode('maintenance', 70).protein_g);
  });
});

describe('mode metadata', () => {
  test('every mode has a non-empty, non-judgemental blurb', () => {
    for (const m of MODES) {
      expect(m.blurb.length).toBeGreaterThan(0);
      expect(m.blurb).not.toMatch(/\b(fail|bad|cheat|guilt|shame)\b/i);
    }
  });

  test('modeMeta falls back gracefully', () => {
    // @ts-expect-error — exercising the runtime fallback for a bad mode
    expect(modeMeta('nonsense').id).toBe('maintenance');
  });
});
