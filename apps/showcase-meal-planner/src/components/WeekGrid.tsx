import { DAYS, SLOTS } from '../lib/types.ts';
import type { Day, Plan, Slot } from '../lib/types.ts';

interface WeekGridProps {
  plan: Plan;
  onPickSlot: (day: Day, slot: Slot) => void;
  /** Drag handle: when set, dragging a day's column rearranges plan days. */
  onMoveDay?: (from: Day, to: Day) => void;
}

/**
 * Weekly grid: 3 rows (Breakfast/Lunch/Dinner) × 7 columns (Mon–Sun).
 * The whole column is the drop target for day-reorder; the cells are
 * the slot picker.
 */
export function WeekGrid({ plan, onPickSlot, onMoveDay }: WeekGridProps) {
  return (
    <section className="grid" aria-label="Week meal plan">
      <div className="grid-head">
        <div />
        {DAYS.map((d) => (
          <DayHeader key={d} day={d} onMoveDay={onMoveDay} />
        ))}
      </div>
      {SLOTS.map((slot) => (
        <div key={slot} className="grid-row">
          <div className="slot">{slot}</div>
          {DAYS.map((day) => {
            const cell = plan[day]?.[slot];
            const cooked = cell?.cooked === true;
            return (
              <button
                key={day + slot}
                className={`cell${cell ? ' filled' : ''}${cooked ? ' cooked' : ''}`}
                onClick={() => onPickSlot(day, slot)}
                aria-label={`${day} ${slot}${cell ? `: ${cell.recipeName}` : ', empty'}`}
              >
                {cell ? (
                  <span className="cell-text">
                    {cooked ? <span aria-hidden="true">✓ </span> : null}
                    {cell.recipeName}
                  </span>
                ) : (
                  '+'
                )}
              </button>
            );
          })}
        </div>
      ))}
    </section>
  );
}

function DayHeader({ day, onMoveDay }: { day: Day; onMoveDay?: (from: Day, to: Day) => void }) {
  const draggable = !!onMoveDay;
  return (
    <div
      className="day"
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.setData('text/x-meal-day', day);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        if (!draggable) return;
        if (e.dataTransfer.types.includes('text/x-meal-day')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={(e) => {
        if (!draggable) return;
        const from = e.dataTransfer.getData('text/x-meal-day') as Day;
        if (!from || from === day) return;
        e.preventDefault();
        onMoveDay?.(from, day);
      }}
      aria-label={draggable ? `${day} (drag to reorder)` : day}
    >
      {day}
    </div>
  );
}
