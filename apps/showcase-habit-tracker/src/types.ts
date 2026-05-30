/**
 * Shared types for Cadence (showcase slug: `habit-tracker`).
 *
 * The data model is intentionally a flat append log (`checks` +
 * `checkins`) plus a habit registry. Streak / return-rate / heatmap /
 * correlations are *derived* — never stored — so the source of truth
 * stays small and migrations stay cheap.
 *
 * Voice-doc invariants:
 *   - the word "broken" never appears in user-visible copy
 *   - missing a day is a fact, not a verdict
 *   - return rate and consistency are reported alongside streaks, not
 *     in place of them
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * Cadence — daily vs weekly habits. Weekly cadence treats the target
 * as N days per ISO week rather than a contiguous streak; streak-math
 * applies the appropriate floor for "done" days.
 */
export type Cadence = 'daily' | 'weekly';

/**
 * What today did. The user can be partially honest (`partial`) without
 * gaming a binary checkbox — useful when "drink 8 glasses" came in at 5.
 *
 * `rest` is a deliberate skip the user has logged. It does not break
 * the return-rate streak. The UI displays it as a sage marker, not a
 * gap.
 */
export type CheckStatus = 'done' | 'partial' | 'missed' | 'rest';

export type CheckSource = 'manual' | 'cross-app' | 'checkin';

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
  /** Daily by default. Weekly habits target N days per ISO week. */
  cadence?: Cadence;
  /**
   * Minimum-viable version (BJ Fogg's "tiny habit"). The shame-free
   * fallback the user can do on a low-capacity day and still count it
   * as a `done` check.
   */
  minimumViable?: string;
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
  /** Optional context note ("did the 1-minute version today"). */
  note?: string;
}

/**
 * 10-second daily check-in. Mood / energy / stress are 1–5 scales —
 * 1 is dim, 5 is bright. `body` is a 1–5 self-assessment ("sore" to
 * "loose"). `sleepHours` is captured when the user didn't already log
 * it elsewhere (we backfill from sleep-logged intents when we have
 * them).
 *
 * Every field is optional: a single tap on one slider already counts
 * as a check-in. The full set is the aspiration, not the requirement.
 */
export interface Checkin {
  id: string;
  /** ISO day key (YYYY-MM-DD). One check-in per day, last write wins. */
  date: string;
  mood?: number;
  energy?: number;
  stress?: number;
  sleepHours?: number;
  body?: number;
  note?: string;
  createdAt: string;
}

/**
 * Weekly review snapshot. The user picks at most three answers in
 * each bucket and we persist them so they can re-read across weeks.
 * Acknowledging the review without filling anything in still creates
 * a row — the act of opening the review is itself the signal.
 */
export interface WeeklyReview {
  id: string;
  isoWeek: string;
  /** Free-text: "what helped" — habit names and short phrases. */
  helped?: string[];
  /** Free-text: "what drained". */
  drained?: string[];
  /** Free-text: "what to try next week". */
  next?: string[];
  createdAt: string;
}

export interface PersistedState {
  habits: Habit[];
  checks: HabitCheck[];
  /** Daily 10-second check-ins (mood / energy / stress / sleep / body). */
  checkins: Checkin[];
  /** Persisted weekly review entries. */
  reviews: WeeklyReview[];
  /** Last-seen ISO week the user opened the weekly review. */
  lastReviewedWeek?: string;
}
