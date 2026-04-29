import { useEffect, useMemo, useState } from 'react';
import {
  createShippieIframeSdk,
  type AgentInsight,
  type AppsListEntry,
} from '@shippie/iframe-sdk';
import { habitsToAutoCheck } from './intent-matcher.ts';

const shippie = createShippieIframeSdk({ appId: 'app_habit_tracker' });

/**
 * P3 — Habit Tracker cross-cap surface.
 *
 * Every other intent the user already has installed gets a dim
 * "suggested habit" tile that taps into the existing add-habit flow.
 * Suggestions come from `apps.list` (P1A.1) — the container scopes
 * the result to apps whose intents overlap with us, so we never
 * fingerprint apps we have no business addressing.
 *
 * The agent insight strip uses `agent.insights` (P1A.2) and respects
 * the source-data invariant the container enforces. We just render
 * what the host gives us.
 */

const SUGGESTION_INTENT_LABELS: Record<string, string> = {
  'cooked-meal': 'Cooked dinner',
  'workout-completed': 'Exercised',
  'sleep-logged': 'Slept ≥7 hours',
  'caffeine-logged': 'Logged caffeine',
  'shopping-list': 'Did groceries',
  'body-metrics-logged': 'Logged weight',
  'pantry-inventory': 'Restocked pantry',
};

interface Habit {
  id: string;
  name: string;
  /** When set, this habit auto-checks on a matching cross-app intent. */
  intent?: string;
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
  const [overlappingApps, setOverlappingApps] = useState<AppsListEntry[]>([]);
  const [insights, setInsights] = useState<AgentInsight[]>([]);

  useEffect(() => {
    save({ habits, checks });
  }, [habits, checks]);

  // P1A.1 — pull the overlap-scoped app list once on mount. The
  // container filters to apps that share at least one intent with
  // this app, so the suggestion surface stays narrow.
  useEffect(() => {
    let cancelled = false;
    shippie.apps
      .list()
      .then((apps) => {
        if (!cancelled) setOverlappingApps(apps);
      })
      .catch(() => {
        // Outside the container or RPC-disabled — empty list is fine.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // P1A.2 — pull insights derived from data we can already see. The
  // host enforces the source-data invariant; we just render.
  useEffect(() => {
    let cancelled = false;
    function refresh() {
      shippie.agent
        .insights()
        .then((next) => {
          if (!cancelled) setInsights(next);
        })
        .catch(() => {
          /* offline / standalone / RPC-disabled */
        });
    }
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const suggestedHabits = useMemo(() => {
    const existing = new Set(
      habits.map((h) => h.intent).filter((i): i is string => Boolean(i)),
    );
    const fromApps = new Set<string>();
    for (const app of overlappingApps) {
      for (const intent of app.provides) fromApps.add(intent);
    }
    return [...fromApps]
      .filter((intent) => !existing.has(intent) && SUGGESTION_INTENT_LABELS[intent])
      .map((intent) => ({ intent, label: SUGGESTION_INTENT_LABELS[intent]! }));
  }, [habits, overlappingApps]);

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
    shippie.feel.texture('confirm');
  }

  function addSuggestedHabit(intent: string, label: string) {
    setHabits((prev) => [
      ...prev,
      { id: `h_${Date.now()}_${intent}`, name: label, intent, createdAt: new Date().toISOString() },
    ]);
    shippie.requestIntent(intent);
    shippie.feel.texture('install');
  }

  function toggleHabit(habit: Habit) {
    const existing = checkedToday(habit.id, checks);
    if (existing) {
      setChecks((prev) => prev.filter((c) => c.id !== existing.id));
      shippie.feel.texture('toggle');
    } else {
      const nextChecks = [
        ...checks,
        {
          id: `${habit.id}_${Date.now()}`,
          habitId: habit.id,
          checkedAt: new Date().toISOString(),
          source: 'manual' as const,
        },
      ];
      setChecks(nextChecks);
      const completedNow = nextChecks.filter(
        (c) => c.checkedAt.slice(0, 10) === todayKey(),
      ).length;
      // `complete` for the "all done" milestone; `confirm` for any
      // other check. Keeps the haptic vocabulary distinct so users
      // physically feel the difference between progress and completion.
      shippie.feel.texture(completedNow === habits.length ? 'complete' : 'confirm');
    }
  }

  return (
    <main>
      <header>
        <h1>Habits</h1>
        <p>{completedToday} of {habits.length} done today</p>
      </header>

      {insights.length > 0 && (
        <section className="insights" aria-label="Insights from the local agent">
          {insights.slice(0, 3).map((insight) => (
            <article key={insight.id} className={`insight insight-${insight.urgency}`}>
              <h2>{insight.title}</h2>
              {insight.body && <p>{insight.body}</p>}
            </article>
          ))}
        </section>
      )}

      {suggestedHabits.length > 0 && (
        <section className="suggestions" aria-label="Suggested habits from your other apps">
          <h2>Suggestions</h2>
          <div className="chips">
            {suggestedHabits.map(({ intent, label }) => (
              <button
                key={intent}
                type="button"
                className="chip"
                onClick={() => addSuggestedHabit(intent, label)}
                title={`Auto-checks when an app fires ${intent}`}
              >
                + {label}
              </button>
            ))}
          </div>
        </section>
      )}

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
