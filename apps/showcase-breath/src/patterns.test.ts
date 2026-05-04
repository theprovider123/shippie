import { describe, expect, test } from 'bun:test';
import { PATTERNS, phaseAt, roundSeconds, totalSeconds } from './patterns';

describe('breath patterns', () => {
  test('every pattern has at least one phase', () => {
    for (const p of PATTERNS) {
      expect(p.phases.length).toBeGreaterThan(0);
    }
  });

  test('roundSeconds sums each pattern', () => {
    const box = PATTERNS.find((p) => p.id === 'box')!;
    expect(roundSeconds(box)).toBe(16); // 4+4+4+4
    const tens = PATTERNS.find((p) => p.id === '4-7-8')!;
    expect(roundSeconds(tens)).toBe(19); // 4+7+8
  });

  test('totalSeconds = roundSeconds × rounds', () => {
    const box = PATTERNS.find((p) => p.id === 'box')!;
    expect(totalSeconds(box, 6)).toBe(96);
  });

  test('phaseAt returns the right phase for a known elapsed time', () => {
    const box = PATTERNS.find((p) => p.id === 'box')!;
    // 0s into round 1 = inhale
    expect(phaseAt(box, 0)?.phase.label).toBe('inhale');
    // 4s in = hold
    expect(phaseAt(box, 4)?.phase.label).toBe('hold');
    // 8s in = exhale
    expect(phaseAt(box, 8)?.phase.label).toBe('exhale');
    // 12s in = hold-empty
    expect(phaseAt(box, 12)?.phase.label).toBe('hold-empty');
    // 16s = round 2 inhale
    const r2 = phaseAt(box, 16);
    expect(r2?.roundIndex).toBe(1);
    expect(r2?.phase.label).toBe('inhale');
  });

  test('phaseAt remainInPhase counts down within a phase', () => {
    const box = PATTERNS.find((p) => p.id === 'box')!;
    expect(phaseAt(box, 0)?.remainInPhase).toBe(4);
    expect(phaseAt(box, 1)?.remainInPhase).toBe(3);
    expect(phaseAt(box, 2)?.remainInPhase).toBe(2);
  });

  test('expand directions are right for inhale/hold/exhale', () => {
    const tens = PATTERNS.find((p) => p.id === '4-7-8')!;
    expect(tens.phases[0]!.expand).toBe(1); // inhale
    expect(tens.phases[1]!.expand).toBe(0); // hold
    expect(tens.phases[2]!.expand).toBe(-1); // exhale
  });
});
