import { SLOTS } from '../lib/types.ts';
import type { Day, Plan, Slot } from '../lib/types.ts';

interface DaySlotsProps {
  day: Day;
  plan: Plan;
  onPickSlot: (slot: Slot) => void;
}

/**
 * Single-day card used on the Day page (mobile-first detail view).
 * Three rows; tapping anywhere on a row opens the editor.
 */
export function DaySlots({ day, plan, onPickSlot }: DaySlotsProps) {
  return (
    <ul className="day-slots" aria-label={`${day} meals`}>
      {SLOTS.map((slot) => {
        const cell = plan[day]?.[slot];
        return (
          <li key={slot}>
            <button
              type="button"
              className={`day-slot${cell ? ' filled' : ''}${cell?.cooked ? ' cooked' : ''}`}
              onClick={() => onPickSlot(slot)}
            >
              <span className="day-slot-label">{slot}</span>
              {cell ? (
                <span className="day-slot-name">
                  {cell.cooked ? <span aria-hidden="true">✓ </span> : null}
                  {cell.recipeName}
                  {cell.servings !== cell.baseServings ? (
                    <small> · {cell.servings} serv</small>
                  ) : null}
                </span>
              ) : (
                <span className="day-slot-name muted">+ plan {slot.toLowerCase()}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
