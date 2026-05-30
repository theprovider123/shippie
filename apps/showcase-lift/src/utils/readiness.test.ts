import { describe, expect, it } from 'bun:test';
import {
  CONSUMED_INTENTS,
  matchReadinessSignal,
  scoreReadiness,
  type ReadinessSignals,
} from './readiness.ts';

describe('scoreReadiness', () => {
  it('is honest when there are no signals', () => {
    const r = scoreReadiness({});
    expect(r.score).toBeNull();
    expect(r.band).toBe('unknown');
    expect(r.honest).toBe(false);
    expect(r.loadAdvice).toBeNull();
    expect(r.factors).toHaveLength(0);
  });

  it('rewards a full night of sleep', () => {
    const r = scoreReadiness({ sleepHours: 8, sleepQuality: 9 });
    expect(r.honest).toBe(true);
    expect(r.score).toBeGreaterThan(80);
    expect(r.band === 'primed' || r.band === 'ready').toBe(true);
    expect(r.factors.some((f) => f.label === 'Sleep' && f.effect === 'up')).toBe(true);
  });

  it('drops hard on a badly under-slept night', () => {
    const r = scoreReadiness({ sleepHours: 4.5, sleepQuality: 3 });
    expect(r.score).toBeLessThan(52);
    expect(r.band).toBe('caution');
    expect(r.loadAdvice).toMatch(/back off/i);
  });

  it('never lets one missing signal tank the score', () => {
    // Only a small positive signal present.
    const r = scoreReadiness({ hydrationLoggedToday: true });
    expect(r.score).toBeGreaterThanOrEqual(70);
  });

  it('clamps to the 0–100 range', () => {
    const everythingBad: ReadinessSignals = {
      sleepHours: 3,
      sleepQuality: 1,
      proteinTargetHit: false,
      nutritionUnderTarget: true,
      cyclePhase: 'menstrual',
      bodyWeightDeltaPct: -3,
    };
    const r = scoreReadiness(everythingBad);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.band).toBe('caution');
  });

  it('treats caffeine as an acute boost but flags over-reliance', () => {
    const boost = scoreReadiness({ caffeineCountToday: 1, caffeineRecentMinutes: 30 });
    const overdone = scoreReadiness({ caffeineCountToday: 5, caffeineRecentMinutes: 30 });
    expect(boost.score!).toBeGreaterThan(overdone.score!);
    expect(overdone.factors.some((f) => f.label === 'Caffeine' && f.effect === 'down')).toBe(true);
  });

  it('treats cycle phase as informational and supportive, not punitive', () => {
    const follicular = scoreReadiness({ cyclePhase: 'follicular' });
    const menstrual = scoreReadiness({ cyclePhase: 'menstrual' });
    expect(follicular.score!).toBeGreaterThan(menstrual.score!);
    // Menstrual nudges down but doesn't crater a single-signal score.
    expect(menstrual.score!).toBeGreaterThan(50);
  });

  it('protein hit nudges readiness up vs missed', () => {
    const hit = scoreReadiness({ proteinTargetHit: true });
    const missed = scoreReadiness({ proteinTargetHit: false });
    expect(hit.score!).toBeGreaterThan(missed.score!);
  });
});

describe('matchReadinessSignal', () => {
  it('maps sleep-logged with several field-name shapes', () => {
    expect(matchReadinessSignal('sleep-logged', [{ sleep_hours: 7.5, quality: 8 }])).toEqual({
      sleepHours: 7.5,
      sleepQuality: 8,
    });
    expect(matchReadinessSignal('sleep-logged', [{ hours: 6 }])).toEqual({ sleepHours: 6 });
  });

  it('maps protein-target-hit to a positive flag by presence', () => {
    expect(matchReadinessSignal('protein-target-hit', [{}])).toEqual({ proteinTargetHit: true });
    expect(matchReadinessSignal('protein-target-hit', [{ hit: false }])).toEqual({
      proteinTargetHit: false,
    });
  });

  it('derives under-target from nutrition-logged calories vs target', () => {
    expect(matchReadinessSignal('nutrition-logged', [{ calories: 1200, target: 2400 }])).toEqual({
      nutritionUnderTarget: true,
    });
    expect(matchReadinessSignal('nutrition-logged', [{ calories: 2300, target: 2400 }])).toEqual({
      nutritionUnderTarget: false,
    });
    expect(matchReadinessSignal('nutrition-logged', [{ under_target: true }])).toEqual({
      nutritionUnderTarget: true,
    });
  });

  it('maps hydration and caffeine', () => {
    expect(matchReadinessSignal('hydration-logged', [{ ml: 500 }])).toEqual({
      hydrationLoggedToday: true,
    });
    expect(matchReadinessSignal('caffeine-logged', [{ count: 2 }])).toEqual({
      caffeineCountToday: 2,
      caffeineRecentMinutes: 0,
    });
    // Defaults to one serving when no count is given.
    expect(matchReadinessSignal('caffeine-logged', [{ mg: 80 }])).toEqual({
      caffeineCountToday: 1,
      caffeineRecentMinutes: 0,
    });
  });

  it('normalises cycle phase strings', () => {
    expect(matchReadinessSignal('cycle-logged', [{ phase: 'Follicular' }])).toEqual({
      cyclePhase: 'follicular',
    });
    expect(matchReadinessSignal('cycle-logged', [{ cycle_phase: 'menstruation' }])).toEqual({
      cyclePhase: 'menstrual',
    });
  });

  it('reads bodyweight from body-metrics-logged', () => {
    expect(matchReadinessSignal('body-metrics-logged', [{ weight_kg: 82.4 }])).not.toBeNull();
    expect(matchReadinessSignal('body-metrics-logged', [{ nothing: 1 }])).toBeNull();
  });

  it('ignores intents it does not consume and empty rows', () => {
    expect(matchReadinessSignal('workout-completed', [{ x: 1 }])).toBeNull();
    expect(matchReadinessSignal('sleep-logged', [])).toBeNull();
    expect(matchReadinessSignal('sleep-logged', [null as unknown])).toBeNull();
  });

  it('every consumed intent has a matcher branch', () => {
    for (const intent of CONSUMED_INTENTS) {
      // A representative payload for each; none should throw, and the
      // ones with usable data should produce a patch.
      const sample: Record<string, unknown> = {
        'sleep-logged': { sleep_hours: 7 },
        'nutrition-logged': { calories: 2000, target: 2000 },
        'protein-target-hit': {},
        'hydration-logged': { ml: 250 },
        'caffeine-logged': { count: 1 },
        'cycle-logged': { phase: 'luteal' },
        'body-metrics-logged': { weight_kg: 80 },
      }[intent]!;
      expect(matchReadinessSignal(intent, [sample])).not.toBeNull();
    }
  });
});
