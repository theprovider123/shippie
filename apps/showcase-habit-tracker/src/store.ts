/**
 * LocalStorage-backed persistence + migration.
 *
 * v1 → v2 forward migration (mid-2026):
 *   - habits gain optional `cadence` and `minimumViable` fields
 *   - checks gain optional `note` and a `rest` status value
 *   - state gains `checkins` (daily 10-second mood/energy/stress log)
 *     and `reviews` (persisted weekly review entries)
 *
 * The legacy v1 schema (`shippie.habit-tracker.v1`) carried `intent` as
 * a top-level field on Habit, no `difficulty`, no `archivedAt`, and a
 * binary `source` on checks (no `status`). All forward migrations are
 * lossless — new fields default to undefined, existing data stays
 * authoritative.
 */

import type {
  Checkin,
  Habit,
  HabitCheck,
  PersistedState,
  WeeklyReview,
} from './types.ts';

const STORAGE_KEY = 'shippie.habit-tracker.v2';
const LEGACY_KEY_V1 = 'shippie.habit-tracker.v1';

interface LegacyHabit {
  id: string;
  name: string;
  intent?: string;
  createdAt: string;
}

interface LegacyCheck {
  id: string;
  habitId: string;
  checkedAt: string;
  source?: 'manual' | 'cross-app';
}

const seedHabits: Habit[] = [
  {
    id: 'h_water',
    name: 'Drink water 8x',
    difficulty: 'easy',
    cue: { intent: 'hydration-logged', autoCheck: true },
    reward: 'a clear head by lunch',
    cadence: 'daily',
    minimumViable: 'one glass with breakfast',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'h_meditate',
    name: 'Meditate 10 min',
    difficulty: 'medium',
    cue: { anchor: 'after I make morning coffee', autoCheck: false },
    cadence: 'daily',
    minimumViable: 'three slow breaths before phone',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'h_exercise',
    name: 'Move my body',
    difficulty: 'medium',
    cue: { intent: 'workout-completed', autoCheck: true },
    cadence: 'daily',
    minimumViable: 'a five-minute walk',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'h_journal',
    name: 'Wrote a line',
    difficulty: 'easy',
    cadence: 'daily',
    minimumViable: 'one sentence about today',
    createdAt: new Date().toISOString(),
  },
];

function migrateHabit(h: LegacyHabit | Habit): Habit {
  // Already a v1+ shape if difficulty exists. Fill in v2 defaults.
  if ('difficulty' in h && h.difficulty) {
    const habit = h as Habit;
    return {
      ...habit,
      cadence: habit.cadence ?? 'daily',
    };
  }
  const legacy = h as LegacyHabit;
  return {
    id: legacy.id,
    name: legacy.name,
    difficulty: 'medium',
    cue: legacy.intent ? { intent: legacy.intent, autoCheck: true } : undefined,
    cadence: 'daily',
    createdAt: legacy.createdAt,
  };
}

function migrateCheck(c: LegacyCheck | HabitCheck): HabitCheck {
  if ('status' in c && c.status) return c as HabitCheck;
  const legacy = c as LegacyCheck;
  return {
    id: legacy.id,
    habitId: legacy.habitId,
    checkedAt: legacy.checkedAt,
    status: 'done',
    source: legacy.source ?? 'manual',
  };
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function load(): PersistedState {
  if (typeof localStorage === 'undefined') {
    return { habits: seedHabits, checks: [], checkins: [], reviews: [] };
  }
  // Prefer v2; fall back to legacy v1 with forward migration.
  const parsed =
    readJson<Partial<PersistedState>>(STORAGE_KEY) ??
    readJson<Partial<PersistedState> & {
      habits?: Array<LegacyHabit | Habit>;
      checks?: Array<LegacyCheck | HabitCheck>;
    }>(LEGACY_KEY_V1);
  if (!parsed) return { habits: seedHabits, checks: [], checkins: [], reviews: [] };
  const habits =
    Array.isArray(parsed.habits) && parsed.habits.length > 0
      ? parsed.habits.map(migrateHabit)
      : seedHabits;
  const checks = Array.isArray(parsed.checks) ? parsed.checks.map(migrateCheck) : [];
  const checkins: Checkin[] = Array.isArray(parsed.checkins)
    ? (parsed.checkins as Checkin[]).filter(
        (c): c is Checkin => Boolean(c && typeof c.date === 'string'),
      )
    : [];
  const reviews: WeeklyReview[] = Array.isArray(parsed.reviews)
    ? (parsed.reviews as WeeklyReview[]).filter(
        (r): r is WeeklyReview => Boolean(r && typeof r.isoWeek === 'string'),
      )
    : [];
  return { habits, checks, checkins, reviews, lastReviewedWeek: parsed.lastReviewedWeek };
}

export function save(state: PersistedState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota errors are non-fatal */
  }
}

/**
 * Export the full persisted state as a JSON blob the user can save to
 * their device. Pairs with `importJson` for restore + transfer flows.
 */
export function exportJson(state: PersistedState): string {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString(), schema: 'habit-tracker.v2' }, null, 2);
}

/**
 * Parse a JSON blob produced by `exportJson` back into a PersistedState.
 * Returns `null` for malformed inputs so the caller can surface a
 * friendly error rather than throwing.
 */
export function importJson(raw: string): PersistedState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState> & {
      habits?: Array<LegacyHabit | Habit>;
      checks?: Array<LegacyCheck | HabitCheck>;
    };
    if (!parsed || typeof parsed !== 'object') return null;
    const habits = Array.isArray(parsed.habits) ? parsed.habits.map(migrateHabit) : [];
    const checks = Array.isArray(parsed.checks) ? parsed.checks.map(migrateCheck) : [];
    const checkins = Array.isArray(parsed.checkins) ? (parsed.checkins as Checkin[]) : [];
    const reviews = Array.isArray(parsed.reviews) ? (parsed.reviews as WeeklyReview[]) : [];
    return { habits, checks, checkins, reviews, lastReviewedWeek: parsed.lastReviewedWeek };
  } catch {
    return null;
  }
}

/**
 * Wipe the entire local store. Used by the danger-zone delete in the
 * Data tab. The caller is responsible for the confirm dialog.
 */
export function clearAll(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_KEY_V1);
  } catch {
    /* quota / privacy errors are non-fatal */
  }
}
