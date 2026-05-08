/**
 * LocalStorage-backed persistence + migration.
 *
 * The legacy schema (`shippie.habit-tracker.v1`) carried `intent` as a
 * top-level field on Habit, no `difficulty`, no `archivedAt`, and a
 * binary `source` on checks (no `status`). We migrate forward at load
 * time so old installs gain the polish without losing data.
 */

import type { Habit, HabitCheck, PersistedState } from './types.ts';

const STORAGE_KEY = 'shippie.habit-tracker.v1';

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
    createdAt: new Date().toISOString(),
  },
  {
    id: 'h_meditate',
    name: 'Meditate 10 min',
    difficulty: 'medium',
    cue: { anchor: 'after I make morning coffee', autoCheck: false },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'h_exercise',
    name: 'Move my body',
    difficulty: 'medium',
    cue: { intent: 'workout-completed', autoCheck: true },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'h_journal',
    name: 'Wrote in journal',
    difficulty: 'easy',
    createdAt: new Date().toISOString(),
  },
];

function migrateHabit(h: LegacyHabit | Habit): Habit {
  // Already in new shape if difficulty exists.
  if ('difficulty' in h && h.difficulty) return h as Habit;
  const legacy = h as LegacyHabit;
  return {
    id: legacy.id,
    name: legacy.name,
    difficulty: 'medium',
    cue: legacy.intent ? { intent: legacy.intent, autoCheck: true } : undefined,
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

export function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { habits: seedHabits, checks: [] };
    const parsed = JSON.parse(raw) as Partial<PersistedState> & {
      habits?: Array<LegacyHabit | Habit>;
      checks?: Array<LegacyCheck | HabitCheck>;
    };
    const habits =
      Array.isArray(parsed.habits) && parsed.habits.length > 0
        ? parsed.habits.map(migrateHabit)
        : seedHabits;
    const checks = Array.isArray(parsed.checks) ? parsed.checks.map(migrateCheck) : [];
    return { habits, checks, lastReviewedWeek: parsed.lastReviewedWeek };
  } catch {
    return { habits: seedHabits, checks: [] };
  }
}

export function save(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota errors are non-fatal */
  }
}
