import { useMemo, useState } from 'react';
import { WeekGrid } from '../components/WeekGrid.tsx';
import { RecipePicker } from '../components/RecipePicker.tsx';
import { PortionScaler } from '../components/PortionScaler.tsx';
import { LeftoverBadge } from '../components/LeftoverBadge.tsx';
import { computeShoppingListFromPlan } from '../missing-items.ts';
import { DAYS } from '../lib/types.ts';
import type {
  CookedMealRow,
  Day,
  LeftoverRow,
  Plan,
  PlanCell,
  Slot,
} from '../lib/types.ts';

interface WeekProps {
  plan: Plan;
  pantry: { name: string }[];
  cookedHistory: readonly CookedMealRow[];
  leftovers: readonly LeftoverRow[];
  onSlotChange: (day: Day, slot: Slot, cell: PlanCell | null) => void;
  onMoveDay: (from: Day, to: Day) => void;
  onMarkCooked: (day: Day, slot: Slot, cookedFor: number) => void;
  onDismissLeftover: (id: string) => void;
}

/**
 * The headline page. Grid up top, leftover badges, then editor +
 * portion-scaler stack inline when a slot is picked.
 */
export function Week({
  plan,
  pantry,
  cookedHistory,
  leftovers,
  onSlotChange,
  onMoveDay,
  onMarkCooked,
  onDismissLeftover,
}: WeekProps) {
  const [editing, setEditing] = useState<{ day: Day; slot: Slot } | null>(null);
  const [cookedFor, setCookedFor] = useState<number>(2);

  const editingCell = editing ? plan[editing.day]?.[editing.slot] : undefined;
  const shopping = useMemo(() => computeShoppingListFromPlan(plan, pantry), [plan, pantry]);

  function handleSave(cell: PlanCell) {
    if (!editing) return;
    onSlotChange(editing.day, editing.slot, cell);
    setEditing(null);
  }

  function handleClear() {
    if (!editing) return;
    onSlotChange(editing.day, editing.slot, null);
    setEditing(null);
  }

  return (
    <div>
      <header className="week-header">
        <h1>Your week</h1>
        <p className="muted">
          {shopping.length === 0
            ? 'Pantry covers everything you planned.'
            : `${shopping.length} ingredient${shopping.length === 1 ? '' : 's'} to buy this week`}
        </p>
      </header>

      {leftovers.length > 0 ? (
        <section className="leftover-stack" aria-label="Leftovers">
          {leftovers.map((row) => (
            <LeftoverBadge key={row.id} row={row} onDismiss={onDismissLeftover} />
          ))}
        </section>
      ) : null}

      <WeekGrid
        plan={plan}
        onPickSlot={(day, slot) => {
          setEditing({ day, slot });
          const existing = plan[day]?.[slot];
          setCookedFor(existing?.servings ?? 2);
        }}
        onMoveDay={onMoveDay}
      />

      {editing ? (
        <>
          <RecipePicker
            day={editing.day}
            slot={editing.slot}
            initial={editingCell}
            recentSuggestions={cookedHistory.slice(-6).reverse()}
            onSave={handleSave}
            onClear={handleClear}
            onCancel={() => setEditing(null)}
          />

          {editingCell ? (
            <section className="card" aria-label="Portion scaling">
              <h2>Servings</h2>
              <PortionScaler
                cell={editingCell}
                onChange={(servings) =>
                  onSlotChange(editing.day, editing.slot, { ...editingCell, servings })
                }
              />

              <div className="cooked-row">
                <label className="field">
                  <span className="field-label">Mouths fed when cooked</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={cookedFor}
                    onChange={(e) => setCookedFor(Math.max(0, Number(e.target.value) || 0))}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    onMarkCooked(editing.day, editing.slot, cookedFor);
                  }}
                >
                  {editingCell.cooked ? 'Re-mark cooked' : 'Mark cooked'}
                </button>
              </div>
              <p className="caveat">
                Surplus shows up as a leftover. Set "mouths fed" below the serving count to
                track what's in the fridge.
              </p>
            </section>
          ) : null}
        </>
      ) : null}

      <section className="card" aria-label="Pantry">
        <h2>Pantry (live)</h2>
        {pantry.length === 0 ? (
          <p className="empty">
            Pantry shows up here when Pantry Scanner shares its inventory.
          </p>
        ) : (
          <ul className="tags">
            {pantry.slice(0, 24).map((p) => (
              <li key={p.name}>{p.name}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-label="Shopping list">
        <h2>Shopping list</h2>
        {shopping.length === 0 ? (
          <p className="empty">
            Plan some meals — anything not in your pantry will land here.
          </p>
        ) : (
          <ul className="shopping">
            {shopping.map((s) => (
              <li key={s.name}>
                <span>{s.name}</span>
                <span className="muted">
                  {typeof s.quantity === 'number' ? (
                    <>
                      {Math.round(s.quantity * 10) / 10}
                      {s.unit ?? ''}
                    </>
                  ) : null}
                  {s.count > 1 ? <small> · in {s.count} meals</small> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Debug aid: jump quick to a day card for the day page. Hidden behind a small list. */}
      <nav className="day-jump" aria-label="Jump to day">
        {DAYS.map((d) => (
          <a key={d} href={`#/day/${d}`}>{d}</a>
        ))}
      </nav>
    </div>
  );
}
