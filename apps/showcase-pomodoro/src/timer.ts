/**
 * Pure pomodoro state machine.
 *
 * Phases cycle: focus(25m) → short-break(5m) → focus(25m) → short-break(5m)
 *   → focus(25m) → short-break(5m) → focus(25m) → long-break(15m) → repeat.
 *
 * The component owns wall-clock + setInterval; this module owns the
 * cycle progression so it can be tested deterministically.
 */

export type PomodoroPhase = 'focus' | 'short-break' | 'long-break';

export interface PomodoroSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesUntilLongBreak: number;
}

export const DEFAULT_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesUntilLongBreak: 4,
};

export interface PomodoroState {
  phase: PomodoroPhase;
  /** How many focus cycles have completed since the start of this run. */
  focusCyclesCompleted: number;
  /** ms remaining in the current phase. */
  remainingMs: number;
}

export function initialState(settings: PomodoroSettings = DEFAULT_SETTINGS): PomodoroState {
  return {
    phase: 'focus',
    focusCyclesCompleted: 0,
    remainingMs: settings.focusMinutes * 60_000,
  };
}

/**
 * Advance to the next phase. The state machine fires this on phase
 * boundary; the component decides when (clock reaching 0).
 */
export function advance(
  state: PomodoroState,
  settings: PomodoroSettings = DEFAULT_SETTINGS,
): PomodoroState {
  if (state.phase === 'focus') {
    const focusCyclesCompleted = state.focusCyclesCompleted + 1;
    const breakIsLong = focusCyclesCompleted % settings.cyclesUntilLongBreak === 0;
    return {
      phase: breakIsLong ? 'long-break' : 'short-break',
      focusCyclesCompleted,
      remainingMs:
        (breakIsLong ? settings.longBreakMinutes : settings.shortBreakMinutes) * 60_000,
    };
  }
  // After any break, return to focus.
  return {
    phase: 'focus',
    focusCyclesCompleted: state.focusCyclesCompleted,
    remainingMs: settings.focusMinutes * 60_000,
  };
}

export function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function phaseLabel(phase: PomodoroPhase): string {
  if (phase === 'focus') return 'Focus';
  if (phase === 'short-break') return 'Short break';
  return 'Long break';
}
