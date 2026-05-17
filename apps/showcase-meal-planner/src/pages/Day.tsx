import { useMemo } from 'react';
import { DaySlots } from '../components/DaySlots.tsx';
import { rollupWeek, roundDisplay } from '../lib/nutrition-rollup.ts';
import { DAYS, SLOTS } from '../lib/types.ts';
import type { Day as DayName, Plan, Slot } from '../lib/types.ts';

interface DayProps {
  day: DayName;
  plan: Plan;
  onPickSlot: (day: DayName, slot: Slot) => void;
  onShiftDay: (delta: -1 | 1) => void;
}

/**
 * Single-day view — for the cook-the-day-of pass. Shows the three
 * slots stacked, plus that day's nutrition totals if any are tracked.
 */
export function Day({ day, plan, onPickSlot, onShiftDay }: DayProps) {
  const rollup = useMemo(() => rollupWeek(plan), [plan]);
  const dayRow = rollup.byDay.find((d) => d.day === day)!;
  const filled = SLOTS.filter((s) => plan[day]?.[s]).length;
  const idx = DAYS.indexOf(day);

  return (
    <div>
      <header className="day-header">
        <button
          type="button"
          className="ghost step"
          onClick={() => onShiftDay(-1)}
          disabled={idx === 0}
          aria-label="Previous day"
        >
          ‹
        </button>
        <h1>{day}</h1>
        <button
          type="button"
          className="ghost step"
          onClick={() => onShiftDay(1)}
          disabled={idx === DAYS.length - 1}
          aria-label="Next day"
        >
          ›
        </button>
      </header>
      <p className="muted">
        {filled === 0
          ? 'Nothing planned yet.'
          : `${filled} of 3 slots planned.`}
      </p>

      <DaySlots day={day} plan={plan} onPickSlot={(slot) => onPickSlot(day, slot)} />

      {dayRow.trackedSlots > 0 ? (
        <section className="card" aria-label={`${day} nutrition`}>
          <h2>{day} nutrition</h2>
          <ul className="nutri-line">
            <li>
              <strong>{roundDisplay(dayRow.totals.calories, 'kcal')}</strong>
              <span>kcal</span>
            </li>
            <li>
              <strong>{roundDisplay(dayRow.totals.protein, 'g')}g</strong>
              <span>protein</span>
            </li>
            <li>
              <strong>{roundDisplay(dayRow.totals.carbs, 'g')}g</strong>
              <span>carbs</span>
            </li>
            <li>
              <strong>{roundDisplay(dayRow.totals.fat, 'g')}g</strong>
              <span>fat</span>
            </li>
            <li>
              <strong>{roundDisplay(dayRow.totals.fibre, 'g')}g</strong>
              <span>fibre</span>
            </li>
          </ul>
          {dayRow.untrackedSlots > 0 ? (
            <p className="caveat">
              {dayRow.untrackedSlots} untracked slot{dayRow.untrackedSlots === 1 ? '' : 's'} — add nutrition in the editor to fold them in.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
