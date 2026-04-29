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

interface CookedMealRow {
  recipeId?: string;
  title: string;
  cookedAt: string;
  ingredients?: string[];
}

const STORAGE_KEY = 'shippie.meal-planner.v1';

interface PersistedState {
  plan: Plan;
  pantry: { name: string }[];
  cookedHistory?: CookedMealRow[];
}

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { plan: {}, pantry: [], cookedHistory: [] };
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      plan: parsed.plan ?? {},
      pantry: Array.isArray(parsed.pantry) ? parsed.pantry : [],
      cookedHistory: Array.isArray(parsed.cookedHistory) ? parsed.cookedHistory : [],
    };
  } catch {
    return { plan: {}, pantry: [], cookedHistory: [] };
  }
}

/**
 * P3 — find the next empty slot in the week so a dropped recipe or
 * a "schedule again" tap doesn't overwrite an existing meal. Walks
 * Mon→Sun, Lunch then Dinner. Returns null when the week is full.
 */
function nextEmptySlot(plan: Plan): { day: Day; slot: Slot } | null {
  for (const day of DAYS) {
    for (const slot of SLOTS) {
      if (!plan[day]?.[slot]) return { day, slot };
    }
  }
  return null;
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
  const [cookedHistory, setCookedHistory] = useState<CookedMealRow[]>(initial.cookedHistory ?? []);
  const [transferActive, setTransferActive] = useState(false);
  const [recentDrop, setRecentDrop] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ plan, pantry, cookedHistory }),
    );
  }, [plan, pantry, cookedHistory]);

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

  // P3 — subscribe to cooked-meal so the "schedule again" panel
  // shows recently-cooked recipes the user may want to repeat.
  useEffect(() => {
    shippie.requestIntent('cooked-meal');
    return shippie.intent.subscribe('cooked-meal', ({ rows }) => {
      const next: CookedMealRow[] = [];
      for (const row of rows as Array<Partial<CookedMealRow>>) {
        if (typeof row?.title !== 'string') continue;
        next.push({
          recipeId: typeof row.recipeId === 'string' ? row.recipeId : undefined,
          title: row.title,
          cookedAt: typeof row.cookedAt === 'string' ? row.cookedAt : new Date().toISOString(),
          ingredients: Array.isArray(row.ingredients)
            ? row.ingredients.filter((s): s is string => typeof s === 'string')
            : undefined,
        });
      }
      if (next.length === 0) return;
      setCookedHistory((prev) => mergeHistory(prev, next));
    });
  }, []);

  // P1A.3 — receive `recipe`-kind transfers from Recipe Saver. A drag
  // start lights up the planner with a banner; the actual commit
  // populates the next empty slot.
  useEffect(() => {
    const offStart = shippie.transfer.onIncomingStart(({ kind }) => {
      if (kind !== 'recipe') return;
      setTransferActive(true);
      // Auto-clear the highlight after 5s in case the source app
      // never commits — the banner shouldn't strand the UI.
      window.setTimeout(() => setTransferActive(false), 5000);
    });
    const offCommit = shippie.transfer.onIncomingCommit(({ kind, payload }) => {
      if (kind !== 'recipe') return;
      setTransferActive(false);
      const cell = readRecipePayload(payload);
      if (!cell) return;
      const target = nextEmptySlot(plan);
      if (!target) {
        setRecentDrop('Week is full — clear a slot first.');
        return;
      }
      setPlan((prev) => ({
        ...prev,
        [target.day]: {
          ...prev[target.day],
          [target.slot]: cell,
        },
      }));
      setRecentDrop(`${cell.recipeName} → ${target.day} ${target.slot}`);
      shippie.feel.texture('install');
      window.setTimeout(() => setRecentDrop(null), 4000);
    });
    return () => {
      offStart();
      offCommit();
    };
  }, [plan]);

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

  function scheduleAgain(row: CookedMealRow) {
    const target = nextEmptySlot(plan);
    if (!target) return;
    const ingredients = row.ingredients ?? [];
    setPlan((prev) => ({
      ...prev,
      [target.day]: {
        ...prev[target.day],
        [target.slot]: { recipeName: row.title, ingredients },
      },
    }));
    shippie.feel.texture('confirm');
  }

  // De-dup recently-cooked rows by recipeId/title; keep the 6 most
  // recent and skip anything already on the plan to avoid suggesting
  // a repeat the user just scheduled.
  const scheduleAgainCandidates = useMemo(() => {
    const planned = new Set<string>();
    for (const day of DAYS) {
      for (const slot of SLOTS) {
        const cell = plan[day]?.[slot];
        if (cell) planned.add(cell.recipeName.toLowerCase());
      }
    }
    return cookedHistory
      .slice(-12)
      .reverse()
      .filter((row) => !planned.has(row.title.toLowerCase()))
      .slice(0, 6);
  }, [cookedHistory, plan]);

  return (
    <main>
      <header>
        <h1>Meal Planner</h1>
        <p>{shopping.length} ingredient{shopping.length === 1 ? '' : 's'} to buy this week</p>
      </header>

      {transferActive && (
        <div className="transfer-banner" role="status">
          Drop a recipe here — it'll land in the next empty slot.
        </div>
      )}
      {recentDrop && (
        <div className="transfer-banner success" role="status">
          ✓ {recentDrop}
        </div>
      )}

      {scheduleAgainCandidates.length > 0 && (
        <section className="schedule-again" aria-label="Schedule again">
          <h2>Schedule again</h2>
          <div className="chips">
            {scheduleAgainCandidates.map((row) => (
              <button
                key={`${row.recipeId ?? row.title}-${row.cookedAt}`}
                type="button"
                className="chip"
                onClick={() => scheduleAgain(row)}
                title={`Cooked ${new Date(row.cookedAt).toLocaleDateString()}`}
              >
                + {row.title}
              </button>
            ))}
          </div>
        </section>
      )}

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

function readRecipePayload(payload: unknown): PlanCell | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  const title = typeof obj.title === 'string' ? obj.title : null;
  const recipeName = typeof obj.recipeName === 'string' ? obj.recipeName : title;
  if (!recipeName) return null;
  const ingredients = Array.isArray(obj.ingredients)
    ? obj.ingredients.filter((s): s is string => typeof s === 'string')
    : [];
  return { recipeName, ingredients };
}

function mergeHistory(
  prev: readonly CookedMealRow[],
  next: readonly CookedMealRow[],
): CookedMealRow[] {
  const seen = new Map<string, CookedMealRow>();
  for (const row of prev) seen.set(row.cookedAt + '|' + row.title, row);
  for (const row of next) seen.set(row.cookedAt + '|' + row.title, row);
  // Keep last ~30 to keep storage bounded.
  return [...seen.values()]
    .sort((a, b) => a.cookedAt.localeCompare(b.cookedAt))
    .slice(-30);
}
