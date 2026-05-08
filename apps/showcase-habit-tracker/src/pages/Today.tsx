import { useMemo } from 'react';
import type { Habit, HabitCheck } from '../types.ts';
import { HabitRow } from '../components/HabitRow.tsx';
import { dayKey } from '../lib/streak-math.ts';

/**
 * The daily list. Active (non-archived) habits, with their tick state
 * for today. Tapping the box does the standard tick/untick. The "½"
 * button records a partial check — explicit honesty rather than
 * gaming the binary.
 */
export function Today({
  habits,
  checks,
  draft,
  onDraftChange,
  onAddHabit,
  onTick,
  onPartial,
  onOpen,
  cuePrompts,
  onDismissCue,
}: {
  habits: readonly Habit[];
  checks: readonly HabitCheck[];
  draft: string;
  onDraftChange: (v: string) => void;
  onAddHabit: () => void;
  onTick: (habit: Habit) => void;
  onPartial: (habit: Habit) => void;
  onOpen: (habit: Habit) => void;
  /** Habits with a reminder-only cue that just fired (e.g. "you brewed — your meditation cue"). */
  cuePrompts: ReadonlyArray<{ habit: Habit; firedIntent: string }>;
  onDismissCue: (habitId: string) => void;
}) {
  const today = useMemo(() => dayKey(new Date()), []);
  const active = useMemo(() => habits.filter((h) => !h.archivedAt), [habits]);

  const checksByHabit = useMemo(() => {
    const map = new Map<string, HabitCheck>();
    for (const c of checks) {
      if (c.checkedAt.slice(0, 10) !== today) continue;
      const existing = map.get(c.habitId);
      // prefer done over partial over missed
      if (!existing || c.status === 'done') map.set(c.habitId, c);
    }
    return map;
  }, [checks, today]);

  const completedToday = Array.from(checksByHabit.values()).filter(
    (c) => c.status === 'done' || c.status === 'partial',
  ).length;

  return (
    <main className="page-today">
      <header className="page-head">
        <h1>Today</h1>
        <p>
          {completedToday === 0
            ? `${active.length} habit${active.length === 1 ? '' : 's'} for today`
            : `${completedToday} of ${active.length} ticked`}
        </p>
      </header>

      {cuePrompts.length > 0 ? (
        <section className="cue-prompts" aria-label="Cue reminders">
          {cuePrompts.map(({ habit, firedIntent }) => (
            <article key={habit.id} className="cue-prompt">
              <p>
                <strong>{habit.name}</strong> — your cue just fired
                <span className="muted"> ({firedIntent})</span>
              </p>
              <div className="cue-prompt-actions">
                <button type="button" className="primary" onClick={() => onTick(habit)}>
                  Did it
                </button>
                <button type="button" className="ghost" onClick={() => onDismissCue(habit.id)}>
                  Not now
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <ul className="habit-list" data-shippie-list>
        {active.map((habit) => (
          <HabitRow
            key={habit.id}
            habit={habit}
            todayCheck={checksByHabit.get(habit.id)}
            onToggle={() => onTick(habit)}
            onPartial={() => onPartial(habit)}
            onOpen={() => onOpen(habit)}
          />
        ))}
        {active.length === 0 ? (
          <li className="empty">No active habits. Add one below — start small.</li>
        ) : null}
      </ul>

      <form
        className="add-habit-form"
        onSubmit={(e) => {
          e.preventDefault();
          onAddHabit();
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Add a habit"
          aria-label="New habit name"
        />
        <button type="submit">Add</button>
      </form>
    </main>
  );
}
