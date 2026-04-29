/**
 * Pomodoro state-machine invariants.
 *   1. focus → short-break (cycles 1, 2, 3) → focus → long-break (cycle 4).
 *   2. long-break → focus.
 *   3. focusCyclesCompleted only increments on focus → break transitions.
 *   4. formatRemaining never produces negative numbers or NaN.
 */
import { describe, expect, test } from 'bun:test';
import {
  advance,
  formatRemaining,
  initialState,
  phaseLabel,
  type PomodoroState,
} from './timer.ts';

describe('pomodoro state machine', () => {
  test('initial phase is focus with the configured duration', () => {
    const s = initialState();
    expect(s.phase).toBe('focus');
    expect(s.focusCyclesCompleted).toBe(0);
    expect(s.remainingMs).toBe(25 * 60_000);
  });

  test('focus → short-break for cycles 1, 2, 3', () => {
    let s: PomodoroState = initialState();
    for (let cycle = 1; cycle <= 3; cycle++) {
      s = advance(s);
      expect(s.phase).toBe('short-break');
      expect(s.focusCyclesCompleted).toBe(cycle);
      // Then back to focus to start the next cycle.
      s = advance(s);
      expect(s.phase).toBe('focus');
    }
  });

  test('the 4th focus → long-break', () => {
    let s: PomodoroState = initialState();
    for (let i = 0; i < 3; i++) {
      s = advance(s); // focus → break
      s = advance(s); // break → focus
    }
    s = advance(s);
    expect(s.phase).toBe('long-break');
    expect(s.focusCyclesCompleted).toBe(4);
  });

  test('long-break → focus completes the cycle', () => {
    let s: PomodoroState = initialState();
    for (let i = 0; i < 4; i++) {
      s = advance(s);
      if (s.phase !== 'focus') s = advance(s);
    }
    expect(s.phase).toBe('focus');
  });
});

describe('formatRemaining', () => {
  test('rounds up to the next second', () => {
    expect(formatRemaining(1500)).toBe('00:02');
    expect(formatRemaining(0)).toBe('00:00');
  });

  test('clamps negatives to zero', () => {
    expect(formatRemaining(-1000)).toBe('00:00');
  });

  test('formats minutes and seconds with leading zeros', () => {
    expect(formatRemaining(25 * 60_000)).toBe('25:00');
    expect(formatRemaining(7 * 60_000 + 5_000)).toBe('07:05');
  });
});

describe('phaseLabel', () => {
  test('returns user-facing names', () => {
    expect(phaseLabel('focus')).toBe('Focus');
    expect(phaseLabel('short-break')).toBe('Short break');
    expect(phaseLabel('long-break')).toBe('Long break');
  });
});
