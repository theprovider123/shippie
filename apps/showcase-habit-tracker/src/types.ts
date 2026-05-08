/**
 * Shared types for the Habit Tracker showcase.
 *
 * The data model is intentionally a flat append log (`checks`) plus a
 * habit registry. Streak/return-rate/heatmap are *derived* — never
 * stored — so the source of truth stays small and migrations stay
 * cheap.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * What today did. The user can be partially honest (`partial`) without
 * gaming a binary checkbox — useful when "drink 8 glasses" came in at 5.
 */
export type CheckStatus = 'done' | 'partial' | 'missed';

export type CheckSource = 'manual' | 'cross-app';

/**
 * Cue-routine-reward scaffolding (Atomic Habits / BJ Fogg).
 *
 * `intent` is the cross-app anchor — when set, an intent broadcast
 * from another Shippie app fires the cue ("you just brewed coffee —
 * your meditation cue") and optionally auto-checks the habit.
 *
 * `anchor` is a plain-text human anchor — "after I make morning
 * coffee", "after I brush my teeth" — for habits whose cue isn't
 * machine-readable.
 */
export interface HabitCue {
  /** Cross-app intent that triggers the cue. */
  intent?: string;
  /** Free-form human anchor — falls through when no intent matches. */
  anchor?: string;
  /** When true, the cue auto-checks the habit (current intent-matcher behaviour). */
  autoCheck?: boolean;
}

export interface Habit {
  id: string;
  name: string;
  difficulty: Difficulty;
  /** Optional reward the user has named themselves ("a square of dark chocolate"). */
  reward?: string;
  cue?: HabitCue;
  createdAt: string;
  /** When archived, the habit hides from the daily list but history remains. */
  archivedAt?: string;
}

export interface HabitCheck {
  id: string;
  habitId: string;
  /** ISO timestamp. The day part (`slice(0, 10)`) is the bucket key. */
  checkedAt: string;
  status: CheckStatus;
  source: CheckSource;
}

export interface PersistedState {
  habits: Habit[];
  checks: HabitCheck[];
  /** Last-seen ISO week the user opened the weekly review. */
  lastReviewedWeek?: string;
}
