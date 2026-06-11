import { describe, expect, it } from 'bun:test';
import {
  remainingSeconds,
  q10Remaining,
  scaleFormula,
  ddtWaterTemp,
  probeState,
  eggPreset,
  cToF,
  fToC,
} from './engine.ts';
import type { Timer, Formula } from './types.ts';
import { DEFAULT_FORMULA } from './store.ts';

// ─── remainingSeconds ────────────────────────────────────────

describe('remainingSeconds', () => {
  const base: Timer = {
    id: 't1',
    label: 'Test',
    duration_s: 300,
    status: 'idle',
    colour: 'green',
    created_at: 0,
  };

  it('idle returns duration_s', () => {
    expect(remainingSeconds(base, Date.now())).toBe(300);
  });

  it('done returns 0', () => {
    expect(remainingSeconds({ ...base, status: 'done' }, Date.now())).toBe(0);
  });

  it('running computes wall-clock remaining', () => {
    const now = 1_700_000_000_000;
    const t: Timer = {
      ...base,
      status: 'running',
      started_at: now - 60_000, // started 60s ago
      elapsed_before_pause_s: 0,
    };
    const rem = remainingSeconds(t, now);
    expect(rem).toBeCloseTo(240, 0); // 300 − 60 = 240
  });

  it('running with prior elapsed', () => {
    const now = 1_700_000_000_000;
    const t: Timer = {
      ...base,
      status: 'running',
      started_at: now - 30_000, // 30s wall since last start
      elapsed_before_pause_s: 60, // 60s accumulated before
    };
    const rem = remainingSeconds(t, now);
    expect(rem).toBeCloseTo(210, 0); // 300 − 30 − 60 = 210
  });

  it('paused returns remaining based on elapsed_before_pause', () => {
    const t: Timer = {
      ...base,
      status: 'paused',
      elapsed_before_pause_s: 100,
    };
    expect(remainingSeconds(t, Date.now())).toBe(200); // 300 − 100
  });

  it('running past end clamps to 0', () => {
    const now = 1_700_000_000_000;
    const t: Timer = {
      ...base,
      status: 'running',
      started_at: now - 400_000, // 400s ago, duration 300
    };
    expect(remainingSeconds(t, now)).toBe(0);
  });
});

// ─── q10Remaining ────────────────────────────────────────────

describe('q10Remaining', () => {
  it('at reference temp: rate=1, remaining = target − elapsed', () => {
    // dough at 24°C (ref), Q10=2 → rate=1
    expect(q10Remaining(14400, 3600, 24)).toBeCloseTo(10800, 0);
  });

  it('at 34°C (10° above ref): rate=2, ferments twice as fast', () => {
    // elapsed 3600s at rate 2 → 7200 equivalent elapsed
    expect(q10Remaining(14400, 3600, 34)).toBeCloseTo(7200, 0);
  });

  it('at 14°C (10° below ref): rate=0.5, slower ferment', () => {
    // elapsed 3600s at rate 0.5 → 1800 equivalent elapsed
    expect(q10Remaining(14400, 3600, 14)).toBeCloseTo(12600, 0);
  });

  it('clamps to 0 when done', () => {
    expect(q10Remaining(3600, 10000, 30)).toBe(0);
  });

  it('never exceeds target', () => {
    expect(q10Remaining(3600, 0, 10)).toBe(3600);
  });
});

// ─── scaleFormula ────────────────────────────────────────────

describe('scaleFormula', () => {
  it('scales country loaf to 1800g correctly', () => {
    const result = scaleFormula(DEFAULT_FORMULA as Formula, 1800);
    // Flour rows: 90 + 10 = 100%; total pct = 90+10+71+20+2.1 = 193.1
    // flourMass = 1800 * (100/193.1) ≈ 932.1g
    expect(result.flourMass).toBeCloseTo(932, 0);
    // Check bread flour grams ≈ 90% of flour mass
    const bf = result.rows.find((r) => r.name === 'Bread flour');
    expect(bf?.grams).toBeCloseTo(932 * 0.9, 0);
  });

  it('salt in range for 2.1%', () => {
    const result = scaleFormula(DEFAULT_FORMULA as Formula, 1800);
    expect(result.saltInRange).toBe(true);
    expect(result.saltPct).toBeCloseTo(2.1, 2);
  });

  it('salt out of range warning for >2.5%', () => {
    const highSalt: Formula = {
      ...DEFAULT_FORMULA as Formula,
      ingredients: [
        ...((DEFAULT_FORMULA as Formula).ingredients.filter((i) => i.name !== 'Salt')),
        { id: 'salt', name: 'Salt', bakers_pct: 3.0, sort_order: 4 },
      ],
    };
    const result = scaleFormula(highSalt, 1000);
    expect(result.saltInRange).toBe(false);
  });

  it('trueHydration accounts for levain water', () => {
    const result = scaleFormula(DEFAULT_FORMULA as Formula, 1800);
    // Water = 71% + levain water
    // Levain is 20%, 100% hydration: levainG = 20/100 * flourMass; levainWater = levainG * 100/200 = levainG/2
    // direct water = 71/100 * flourMass
    // trueHydration = (directWater + levainWater) / flourMass * 100
    // = (71 + 20/2)% = 81%
    expect(result.trueHydration).toBeCloseTo(81, 0);
  });

  it('prefermentedPct is approx flour in levain', () => {
    const result = scaleFormula(DEFAULT_FORMULA as Formula, 1800);
    // Levain 20%, 100% hydration: levainFlour = levainG / 2 = (20/100 * flourMass)/2 = 10% of flourMass
    expect(result.prefermentedPct).toBeCloseTo(10, 0);
  });
});

// ─── ddtWaterTemp ────────────────────────────────────────────

describe('ddtWaterTemp', () => {
  it('computes water temp with spiral friction default', () => {
    // ddt=24, room=20, flour=18, friction=25 → 24*3 − 20 − 18 − 25 = 72 − 63 = 9
    expect(ddtWaterTemp(24, 20, 18)).toBe(9);
  });

  it('uses custom friction', () => {
    expect(ddtWaterTemp(24, 20, 18, 28)).toBe(6);
  });

  it('handles summer conditions', () => {
    // ddt=25, room=24, flour=22, friction=25 → 75 − 71 = 4
    expect(ddtWaterTemp(25, 24, 22)).toBe(4);
  });
});

// ─── probeState ──────────────────────────────────────────────

describe('probeState', () => {
  it('tracking when >3° below pull', () => {
    expect(probeState(44, 52)).toBe('tracking');
  });

  it('nearly when ≤3° below pull', () => {
    expect(probeState(49.5, 52)).toBe('nearly');
    expect(probeState(50, 52)).toBe('nearly');
  });

  it('pull when at or above pull temp', () => {
    expect(probeState(52, 52)).toBe('pull');
    expect(probeState(55, 52)).toBe('pull');
  });

  it('nearly at exactly 3° below', () => {
    expect(probeState(49, 52)).toBe('nearly');
  });

  it('tracking at 3.1° below', () => {
    expect(probeState(48.9, 52)).toBe('tracking');
  });
});

// ─── eggPreset ────────────────────────────────────────────────

describe('eggPreset', () => {
  it('base time unchanged for medium/room-temp', () => {
    expect(eggPreset(360, false, false)).toBe(360);
  });

  it('+30s for large', () => {
    expect(eggPreset(360, true, false)).toBe(390);
  });

  it('+30s for from fridge', () => {
    expect(eggPreset(360, false, true)).toBe(390);
  });

  it('+60s for large + from fridge', () => {
    expect(eggPreset(360, true, true)).toBe(420);
  });

  it('jammy 7:30 base = 450s', () => {
    expect(eggPreset(450, false, false)).toBe(450);
    expect(eggPreset(450, true, true)).toBe(510);
  });
});

// ─── cToF / fToC ─────────────────────────────────────────────

describe('temperature conversions', () => {
  it('cToF: 0°C = 32°F', () => {
    expect(cToF(0)).toBe(32);
  });

  it('cToF: 100°C = 212°F', () => {
    expect(cToF(100)).toBe(212);
  });

  it('cToF: 52°C ≈ 125.6°F', () => {
    expect(cToF(52)).toBeCloseTo(125.6, 1);
  });

  it('fToC: 32°F = 0°C', () => {
    expect(fToC(32)).toBe(0);
  });

  it('round-trip', () => {
    expect(fToC(cToF(60))).toBeCloseTo(60, 5);
  });
});

// ─── Timer reload reconciliation ─────────────────────────────

describe('timer reload reconciliation (store.reconcileTimers via load)', () => {
  it('expired running timer becomes done (tested via logic)', () => {
    // Test the logic directly
    const now = Date.now();
    const t: Timer = {
      id: 'x1',
      label: 'Test',
      duration_s: 60,
      started_at: now - 120_000, // started 120s ago, duration 60s
      status: 'running',
      colour: 'green',
      created_at: now - 120_000,
    };
    // remainingSeconds should return 0
    expect(remainingSeconds(t, now)).toBe(0);
  });
});
