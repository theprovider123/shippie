import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { habitsToAutoCheck } from './intent-matcher.ts';

const shippie = createShippieIframeSdk({ appId: 'app_habit_tracker' });

interface Habit {
  id: string;
  name: string;
  /** When set, this habit auto-checks on a matching cross-app intent. */
  intent?: 'cooked-meal' | 'workout-completed';
  createdAt: string;
}

interface HabitCheck {
  id: string;
  habitId: string;
  checkedAt: string;
  source: 'manual' | 'cross-app';
}

const STORAGE_KEY = 'shippie.habit-tracker.v1';

interface PersistedState {
  habits: Habit[];
  checks: HabitCheck[];
}

const seedHabits: Habit[] = [
  { id: 'h_cooked', name: 'Cooked dinner', intent: 'cooked-meal', createdAt: new Date().toISOString() },
  { id: 'h_exercise', name: 'Exercised', intent: 'workout-completed', createdAt: new Date().toISOString() },
  { id: 'h_journal', name: 'Wrote in journal', createdAt: new Date().toISOString() },
];

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { habits: seedHabits, checks: [] };
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      habits: Array.isArray(parsed.habits) && parsed.habits.length > 0 ? parsed.habits : seedHabits,
      checks: Array.isArray(parsed.checks) ? parsed.checks : [],
    };
  } catch {
    return { habits: seedHabits, checks: [] };
  }
}

function save(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* no-op — quota errors are non-fatal */
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function checkedToday(habitId: string, checks: HabitCheck[]): HabitCheck | undefined {
  const today = todayKey();
  return checks.find((c) => c.habitId === habitId && c.checkedAt.slice(0, 10) === today);
}

export function App() {
  const [habits, setHabits] = useState<Habit[]>(() => load().habits);
  const [checks, setChecks] = useState<HabitCheck[]>(() => load().checks);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    save({ habits, checks });
  }, [habits, checks]);

  // First-mount: ask the container to grant each declared consume
  // intent. The user approves once per intent and subsequent broadcasts
  // arrive automatically.
  useEffect(() => {
    const wanted = Array.from(
      new Set(
        habits
          .map((h) => h.intent)
          .filter((i): i is NonNullable<Habit['intent']> => Boolean(i)),
      ),
    );
    for (const intent of wanted) shippie.requestIntent(intent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to forwarded broadcasts. The container wraps
  // `intent.provide` payloads as `shippie.intent.broadcast` postMessages
  // and dispatches them to every granted consumer iframe.
  useEffect(() => {
    function applyIntent(intent: string) {
      setChecks((prev) => {
        const ids = habitsToAutoCheck(intent, habits, prev, todayKey());
        if (ids.length === 0) return prev;
        const stamp = Date.now();
        return [
          ...prev,
          ...ids.map((habitId, i) => ({
            id: `${habitId}_${stamp}_${i}`,
            habitId,
            checkedAt: new Date().toISOString(),
            source: 'cross-app' as const,
          })),
        ];
      });
    }
    const offs = Array.from(
      new Set(
        habits
          .map((h) => h.intent)
          .filter((i): i is NonNullable<Habit['intent']> => Boolean(i)),
      ),
    ).map((intent) => shippie.intent.subscribe(intent, ({ intent }) => applyIntent(intent)));
    return () => {
      for (const off of offs) off();
    };
  }, [habits]);

  const today = useMemo(() => todayKey(), []);
  const completedToday = checks.filter((c) => c.checkedAt.slice(0, 10) === today).length;

  function addHabit() {
    const name = draft.trim();
    if (!name) return;
    setHabits((prev) => [
      ...prev,
      { id: `h_${Date.now()}`, name, createdAt: new Date().toISOString() },
    ]);
    setDraft('');
  }

  function toggleHabit(habit: Habit) {
    const existing = checkedToday(habit.id, checks);
    if (existing) {
      setChecks((prev) => prev.filter((c) => c.id !== existing.id));
    } else {
      setChecks((prev) => [
        ...prev,
        {
          id: `${habit.id}_${Date.now()}`,
          habitId: habit.id,
          checkedAt: new Date().toISOString(),
          source: 'manual',
        },
      ]);
    }
  }

  return (
    <main>
      <header>
        <h1>Habits</h1>
        <p>{completedToday} of {habits.length} done today</p>
      </header>

      <ul data-shippie-list>
        {habits.map((habit) => {
          const check = checkedToday(habit.id, checks);
          const checked = Boolean(check);
          return (
            <li key={habit.id} className={checked ? 'done' : ''}>
              <button
                onClick={() => toggleHabit(habit)}
                aria-pressed={checked}
                aria-label={`${checked ? 'Uncheck' : 'Check'} ${habit.name}`}
              >
                <span className="box" aria-hidden="true">{checked ? '✓' : ''}</span>
                <span className="name">{habit.name}</span>
                {habit.intent && (
                  <span className="intent" title={`Auto-checks on ${habit.intent}`}>
                    ↗ {habit.intent}
                  </span>
                )}
                {check?.source === 'cross-app' && (
                  <span className="auto" aria-label="Auto-checked from another app">auto</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addHabit();
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a habit"
          aria-label="New habit name"
        />
        <button type="submit">Add</button>
      </form>
    </main>
  );
}
