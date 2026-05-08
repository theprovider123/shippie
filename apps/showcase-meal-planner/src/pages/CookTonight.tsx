import { useMemo } from 'react';
import { cookTonightFromPlan, type CookTonightRow } from '../lib/cook-tonight.ts';
import type { CookedMealRow, Plan } from '../lib/types.ts';

interface CookTonightProps {
  plan: Plan;
  cookedHistory: readonly CookedMealRow[];
  pantry: readonly { name: string }[];
  onCook: (row: CookTonightRow) => void;
}

/**
 * Lists candidate meals you could make right now, ordered by fewest
 * missing ingredients. The user sees what they have AND what's short
 * — no scoring, no badges. Tap "Cook this" to drop the recipe into
 * tonight's dinner slot.
 */
export function CookTonight({ plan, cookedHistory, pantry, onCook }: CookTonightProps) {
  const rows = useMemo(
    () => cookTonightFromPlan(plan, cookedHistory, pantry),
    [plan, cookedHistory, pantry],
  );

  return (
    <div>
      <header>
        <h1>What can I make tonight?</h1>
        <p className="muted">
          Cross-referencing your pantry against recipes you've cooked or planned. Fewest missing
          first.
        </p>
      </header>

      {pantry.length === 0 ? (
        <p className="empty">
          Pantry's empty (or hasn't shared yet). Open Pantry Scanner once and the inventory
          flows over.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="empty">
          Nothing in your recent recipes to cross-reference yet — plan a meal or cook one to
          seed this.
        </p>
      ) : (
        <ul className="cook-tonight">
          {rows.map((row) => {
            const total = row.have.length + row.missing.length;
            const ready = row.missing.length === 0;
            return (
              <li
                key={row.recipeName}
                className={`cook-row${ready ? ' ready' : ''}`}
              >
                <div className="cook-head">
                  <strong>{row.recipeName}</strong>
                  <span className="muted small">
                    {ready
                      ? 'Have everything'
                      : `Have ${row.have.length} of ${total} · short ${row.missing.length}`}
                  </span>
                </div>
                {row.missing.length > 0 ? (
                  <ul className="missing-list">
                    {row.missing.slice(0, 6).map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                    {row.missing.length > 6 ? (
                      <li className="muted">+{row.missing.length - 6} more</li>
                    ) : null}
                  </ul>
                ) : null}
                <div className="cook-actions">
                  <span className="muted small">
                    from {row.source === 'planned' ? 'this week' : 'recently cooked'}
                  </span>
                  <button type="button" onClick={() => onCook(row)}>
                    Cook this
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
