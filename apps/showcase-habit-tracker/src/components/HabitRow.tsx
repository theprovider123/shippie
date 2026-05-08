import type { Habit, HabitCheck, CheckStatus } from '../types.ts';
import { DifficultyPill } from './DifficultyPill.tsx';

/**
 * A row in the today list. Three states:
 *  - blank box (today not logged)
 *  - filled box (done — full credit)
 *  - half-filled box (partial — honest credit for "I did some of it")
 *
 * Tapping the box cycles done → blank. The "partial" state is reachable
 * via a long-press equivalent (the … button) — visible, never hidden.
 */
export function HabitRow({
  habit,
  todayCheck,
  onToggle,
  onPartial,
  onOpen,
}: {
  habit: Habit;
  todayCheck: HabitCheck | undefined;
  onToggle: () => void;
  onPartial: () => void;
  onOpen: () => void;
}) {
  const status: CheckStatus | 'blank' = todayCheck?.status ?? 'blank';
  const checked = status === 'done' || status === 'partial';
  return (
    <li className={`habit-row habit-row-${status}`}>
      <button
        type="button"
        className="habit-row-tick"
        onClick={onToggle}
        aria-pressed={checked}
        aria-label={`${checked ? 'Untick' : 'Tick'} ${habit.name}`}
      >
        <span className={`box box-${status}`} aria-hidden="true">
          {status === 'done' ? '✓' : status === 'partial' ? '½' : ''}
        </span>
      </button>
      <button type="button" className="habit-row-body" onClick={onOpen}>
        <span className="name">{habit.name}</span>
        <span className="row-meta">
          <DifficultyPill value={habit.difficulty} />
          {habit.cue?.intent ? (
            <span className="intent" title={`Auto-source: ${habit.cue.intent}`}>
              {'↗'} {habit.cue.intent}
            </span>
          ) : null}
          {habit.cue?.anchor ? (
            <span className="anchor" title={habit.cue.anchor}>
              after: {habit.cue.anchor}
            </span>
          ) : null}
          {todayCheck?.source === 'cross-app' ? <span className="auto">auto</span> : null}
        </span>
      </button>
      <button
        type="button"
        className="habit-row-partial"
        onClick={onPartial}
        aria-label={`Mark ${habit.name} as partial today`}
        title="Partial — I did some of it"
      >
        {'½'}
      </button>
    </li>
  );
}
