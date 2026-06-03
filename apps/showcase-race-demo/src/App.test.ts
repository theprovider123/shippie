import { describe, expect, test } from 'bun:test';
import {
  cutoffCushionSeconds,
  estimateArrivalSeconds,
  formatDuration,
  formatPace,
  parsePace,
  projectedFinishSeconds,
} from './calculations.ts';

describe('race calculations', () => {
  test('formats target pace and finish times', () => {
    expect(parsePace('5:41')).toBe(341);
    expect(formatPace(341)).toBe('5:41');
    expect(formatDuration(7200)).toBe('2:00:00');
  });

  test('projects finish from covered distance and live pace', () => {
    const projected = projectedFinishSeconds(6.82, 6.82 * 338, 338);
    expect(Math.round(projected)).toBe(7132);
  });

  test('flags cutoff cushions against the wave start', () => {
    const arrival = estimateArrivalSeconds(10.5, 6.82, 6.82 * 338, 338);
    expect(cutoffCushionSeconds('11:30', '09:00', arrival)).toBeGreaterThan(0);
  });
});
