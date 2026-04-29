import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { computeShoppingList } from './missing-items.ts';

const shippie = createShippieIframeSdk({ appId: 'app_meal_planner' });

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const SLOTS = ['Lunch', 'Dinner'] as const;

type Day = typeof DAYS[number];
type Slot = typeof SLOTS[number];

interface PlanCell {
  recipeName: string;
  ingredients: string[];
}

type Plan = Partial<Record<Day, Partial<Record<Slot, PlanCell>>>>;

const STORAGE_KEY = 'shippie.meal-planner.v1';

interface PersistedState {
  plan: Plan;
  pantry: { name: string }[];
}

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { plan: {}, pantry: [] };
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      plan: parsed.plan ?? {},
      pantry: Array.isArray(parsed.pantry) ? parsed.pantry : [],
    };
  } catch {
    return { plan: {}, pantry: [] };
  }
}

function broadcastShoppingList(rows: { name: string; count: number }[]): void {
  shippie.intent.broadcast('shopping-list', rows);
}

export function App() {
  const initial = load();
  const [plan, setPlan] = useState<Plan>(initial.plan);
  const [pantry, setPantry] = useState<{ name: string }[]>(initial.pantry);
  const [editing, setEditing] = useState<{ day: Day; slot: Slot } | null>(null);
  const [draftRecipe, setDraftRecipe] = useState('');
  const [draftIngredients, setDraftIngredients] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ plan, pantry }));
  }, [plan, pantry]);

  // Subscribe to pantry-inventory broadcasts via the SDK. Once-per-mount
  // request triggers the container's permission prompt; subsequent
  // broadcasts arrive on the subscribe handler.
  useEffect(() => {
    shippie.requestIntent('pantry-inventory');
    return shippie.intent.subscribe('pantry-inventory', ({ rows }) => {
      const items = rows
        .map((r) => {
          const candidate = r ?? {};
          if (candidate && typeof candidate === 'object' && 'name' in candidate) {
            const name = (candidate as { name?: unknown }).name;
            return typeof name === 'string' ? { name } : null;
          }
          return null;
        })
        .filter((x): x is { name: string } => x !== null);
      setPantry(items);
    });
  }, []);

  const allIngredients = useMemo(() => {
    const out: { name: string }[] = [];
    for (const day of DAYS) {
      for (const slot of SLOTS) {
        const cell = plan[day]?.[slot];
        if (!cell) continue;
        for (const ing of cell.ingredients) out.push({ name: ing });
      }
    }
    return out;
  }, [plan]);

  const shopping = useMemo(() => computeShoppingList(allIngredients, pantry), [allIngredients, pantry]);

  // Whenever the shopping list changes, broadcast to consumers (Shopping List).
  useEffect(() => {
    if (shopping.length > 0) broadcastShoppingList(shopping);
  }, [shopping]);

  function startEdit(day: Day, slot: Slot) {
    setEditing({ day, slot });
    const cell = plan[day]?.[slot];
    setDraftRecipe(cell?.recipeName ?? '');
    setDraftIngredients(cell?.ingredients.join(', ') ?? '');
  }

  function saveCell() {
    if (!editing) return;
    const ingredients = draftIngredients
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setPlan((prev) => ({
      ...prev,
      [editing.day]: {
        ...prev[editing.day],
        [editing.slot]: { recipeName: draftRecipe.trim() || '—', ingredients },
      },
    }));
    setEditing(null);
    setDraftRecipe('');
    setDraftIngredients('');
  }

  function clearCell() {
    if (!editing) return;
    setPlan((prev) => {
      const dayPlan = { ...(prev[editing.day] ?? {}) };
      delete dayPlan[editing.slot];
      return { ...prev, [editing.day]: dayPlan };
    });
    setEditing(null);
  }

  return (
    <main>
      <header>
        <h1>Meal Planner</h1>
        <p>{shopping.length} ingredient{shopping.length === 1 ? '' : 's'} to buy this week</p>
      </header>

      <section className="grid">
        <div className="grid-head">
          <div />
          {DAYS.map((d) => (
            <div key={d} className="day">{d}</div>
          ))}
        </div>
        {SLOTS.map((slot) => (
          <div key={slot} className="grid-row">
            <div className="slot">{slot}</div>
            {DAYS.map((day) => {
              const cell = plan[day]?.[slot];
              return (
                <button
                  key={day + slot}
                  className={`cell${cell ? ' filled' : ''}`}
                  onClick={() => startEdit(day, slot)}
                >
                  {cell ? cell.recipeName : '+'}
                </button>
              );
            })}
          </div>
        ))}
      </section>

      {editing && (
        <section className="editor" aria-label="Edit meal slot">
          <h2>{editing.day} · {editing.slot}</h2>
          <input
            type="text"
            value={draftRecipe}
            onChange={(e) => setDraftRecipe(e.target.value)}
            placeholder="Recipe name"
            aria-label="Recipe name"
          />
          <textarea
            value={draftIngredients}
            onChange={(e) => setDraftIngredients(e.target.value)}
            placeholder="Comma-separated ingredients"
            aria-label="Ingredients"
            rows={3}
          />
          <div className="row">
            <button className="ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="ghost danger" onClick={clearCell}>Clear</button>
            <button onClick={saveCell}>Save</button>
          </div>
        </section>
      )}

      <section>
        <h2>Pantry (live)</h2>
        {pantry.length === 0 ? (
          <p className="empty">Pantry shows up here when Pantry Scanner shares its inventory.</p>
        ) : (
          <ul className="tags">
            {pantry.slice(0, 24).map((p) => (
              <li key={p.name}>{p.name}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Shopping list</h2>
        {shopping.length === 0 ? (
          <p className="empty">Plan some meals — anything not in your pantry will land here.</p>
        ) : (
          <ul className="shopping">
            {shopping.map((s) => (
              <li key={s.name}>
                <span>{s.name}</span>
                {s.count > 1 && <small>× {s.count} recipes</small>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
