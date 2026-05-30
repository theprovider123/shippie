import { describe, expect, it } from 'bun:test';
import {
  applyWeekLoad,
  nextProgramPosition,
  programProgressFraction,
  weekLabel,
} from './program.ts';

describe('nextProgramPosition', () => {
  it('starts at week 0 day 0', () => {
    expect(nextProgramPosition(0, 3, 4)).toMatchObject({ weekIndex: 0, dayIndex: 0, done: false });
  });

  it('walks the rotation then rolls into the next week', () => {
    expect(nextProgramPosition(2, 3, 4)).toMatchObject({ weekIndex: 0, dayIndex: 2 });
    expect(nextProgramPosition(3, 3, 4)).toMatchObject({ weekIndex: 1, dayIndex: 0 });
    expect(nextProgramPosition(7, 3, 4)).toMatchObject({ weekIndex: 2, dayIndex: 1 });
  });

  it('marks the block done once every session is complete', () => {
    const pos = nextProgramPosition(12, 3, 4);
    expect(pos.done).toBe(true);
  });

  it('resumes at the same slot after a missed day (pointer only advances on completion)', () => {
    // Completed 4 sessions → next is week 1 day 1, regardless of calendar gaps.
    const pos = nextProgramPosition(4, 3, 4);
    expect(pos).toMatchObject({ weekIndex: 1, dayIndex: 1 });
  });

  it('is safe on degenerate input', () => {
    expect(nextProgramPosition(0, 0, 4).done).toBe(true);
  });
});

describe('programProgressFraction', () => {
  it('reports progress through the block', () => {
    expect(programProgressFraction(0, 3, 4)).toBe(0);
    expect(programProgressFraction(6, 3, 4)).toBe(0.5);
    expect(programProgressFraction(12, 3, 4)).toBe(1);
    expect(programProgressFraction(20, 3, 4)).toBe(1); // clamped
  });
});

describe('applyWeekLoad', () => {
  it('scales a working weight by the week multiplier and rounds to plates', () => {
    expect(applyWeekLoad(100, 1, 2.5)).toBe(100);
    expect(applyWeekLoad(100, 0.6, 2.5)).toBe(60);
    // 102 * 0.9 = 91.8 → nearest 2.5 = 92.5
    expect(applyWeekLoad(102, 0.9, 2.5)).toBe(92.5);
  });

  it('returns 0 for no base weight', () => {
    expect(applyWeekLoad(0, 1, 2.5)).toBe(0);
  });
});

describe('weekLabel', () => {
  it('falls back to Week N and marks deloads', () => {
    expect(weekLabel(0, null, false)).toBe('Week 1');
    expect(weekLabel(3, null, true)).toBe('Week 4 · deload');
    expect(weekLabel(1, 'Intensity', false)).toBe('Intensity');
  });
});
