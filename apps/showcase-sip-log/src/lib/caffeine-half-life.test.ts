import { describe, expect, test } from 'bun:test';
import {
  caffeineCurve,
  classifyMidnightResidual,
  DEFAULT_HALF_LIFE_HOURS,
  midnightResidual,
  residualAt,
  residualFromDose,
} from './caffeine-half-life';
import type { Sip } from '../db';

const sip = (overrides: Partial<Sip> = {}): Sip => ({
  id: overrides.id ?? 's',
  kind: overrides.kind ?? 'coffee-mug',
  ml: overrides.ml ?? 240,
  mg: overrides.mg ?? 95,
  logged_at: overrides.logged_at ?? new Date().toISOString(),
});

describe('caffeine half-life', () => {
  test('DEFAULT_HALF_LIFE_HOURS is 5 (the canonical figure)', () => {
    expect(DEFAULT_HALF_LIFE_HOURS).toBe(5);
  });

  test('residualFromDose halves the dose at one half-life', () => {
    expect(residualFromDose(100, 5)).toBeCloseTo(50, 5);
  });

  test('residualFromDose quarters the dose at two half-lives', () => {
    expect(residualFromDose(200, 10)).toBeCloseTo(50, 5);
  });

  test('residualFromDose returns zero before ingestion (negative time)', () => {
    expect(residualFromDose(100, -1)).toBe(0);
  });

  test('residualFromDose returns zero for a zero dose', () => {
    expect(residualFromDose(0, 1)).toBe(0);
  });

  test('residualAt sums residuals from all earlier sips and ignores future ones', () => {
    // 100mg at 08:00, 100mg at 13:00. At 13:00 → first dose has decayed
    // by one half-life (8→13 = 5h), so residual is 50 + 100 = 150 (future
    // dose at exactly 13:00 also counts since hours_since=0).
    const day = '2026-05-01';
    const sips: Sip[] = [
      sip({ id: 'a', mg: 100, logged_at: new Date(`${day}T08:00:00`).toISOString() }),
      sip({ id: 'b', mg: 100, logged_at: new Date(`${day}T13:00:00`).toISOString() }),
    ];
    const at = new Date(`${day}T13:00:00`).toISOString();
    const total = residualAt(sips, at);
    expect(total).toBeCloseTo(150, 5);
  });

  test('residualAt does not count sips logged after the query time', () => {
    const day = '2026-05-01';
    const sips: Sip[] = [
      sip({ id: 'a', mg: 100, logged_at: new Date(`${day}T13:00:00`).toISOString() }),
    ];
    const at = new Date(`${day}T08:00:00`).toISOString();
    expect(residualAt(sips, at)).toBe(0);
  });

  test('caffeineCurve produces 24*60/15 + 1 samples spanning the day', () => {
    const day = '2026-05-01';
    const samples = caffeineCurve([], new Date(`${day}T00:00:00`).toISOString(), 15);
    expect(samples.length).toBe((24 * 60) / 15 + 1);
    expect(samples[0]?.minute).toBe(0);
    expect(samples[samples.length - 1]?.minute).toBe(24 * 60);
  });

  test('midnightResidual evaluates at start-of-next-day for the given day', () => {
    // 200mg at 13:00 on 2026-05-01 → midnight = 11h later → 200 * 0.5^(11/5) ≈ 43.5
    const sips: Sip[] = [
      sip({ id: 'a', mg: 200, logged_at: new Date('2026-05-01T13:00:00').toISOString() }),
    ];
    const r = midnightResidual(sips, '2026-05-01');
    expect(r).toBeGreaterThan(40);
    expect(r).toBeLessThan(50);
  });

  test('midnightResidual returns 0 for an empty day', () => {
    expect(midnightResidual([], '2026-05-01')).toBe(0);
  });

  test('classifyMidnightResidual buckets sleep impact', () => {
    expect(classifyMidnightResidual(0)).toBe('clear');
    expect(classifyMidnightResidual(49)).toBe('clear');
    expect(classifyMidnightResidual(50)).toBe('mild');
    expect(classifyMidnightResidual(99)).toBe('mild');
    expect(classifyMidnightResidual(100)).toBe('high');
    expect(classifyMidnightResidual(200)).toBe('high');
  });
});
