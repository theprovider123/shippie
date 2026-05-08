import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { Week } from './pages/Week.tsx';
import { Day } from './pages/Day.tsx';
import { CookTonight } from './pages/CookTonight.tsx';
import { Nutrition } from './pages/Nutrition.tsx';
import { Settings } from './pages/Settings.tsx';
import { computeShoppingListFromPlan } from './missing-items.ts';
import { deriveLeftover } from './lib/leftover-tracker.ts';
import { cellFromCandidate, type CookTonightRow } from './lib/cook-tonight.ts';
import { DEFAULT_COST_PER_SERVING } from './lib/cost-estimate.ts';
import { DAYS } from './lib/types.ts';
import type {
  CookedMealRow,
  Day as DayName,
  LeftoverRow,
  Plan,
  PlanCell,
  Slot,
} from './lib/types.ts';

const shippie = createShippieIframeSdk({ appId: 'app_meal_planner' });
const STORAGE_KEY = 'shippie.meal-planner.v2';

type Tab = 'week' | 'day' | 'cook' | 'nutrition' | 'settings';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'week', label: 'Week' },
  { id: 'day', label: 'Day' },
  { id: 'cook', label: 'Cook tonight' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'settings', label: 'Settings' },
];

interface PersistedState {
  plan: Plan;
  pantry: { name: string }[];
  cookedHistory: CookedMealRow[];
  leftovers: LeftoverRow[];
  fallbackPerServing: number;
  currency: string;
  budgetCap: number | null;
  selectedDay: DayName;
}

function emptyState(): PersistedState {
  return {
    plan: {},
    pantry: [],
    cookedHistory: [],
    leftovers: [],
    fallbackPerServing: DEFAULT_COST_PER_SERVING,
    currency: '',
    budgetCap: null,
    selectedDay: 'Mon',
  };
}

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      ...emptyState(),
      ...parsed,
      plan: parsed.plan ?? {},
      pantry: Array.isArray(parsed.pantry) ? parsed.pantry : [],
      cookedHistory: Array.isArray(parsed.cookedHistory) ? parsed.cookedHistory : [],
      leftovers: Array.isArray(parsed.leftovers) ? parsed.leftovers : [],
    };
  } catch {
    return emptyState();
  }
}

function nextEmptySlot(plan: Plan): { day: DayName; slot: Slot } | null {
  // Walk Mon→Sun. Prefer Dinner, then Lunch, then Breakfast — most
  // users plan dinner first, so a dropped recipe slots there.
  for (const day of DAYS) {
    if (!plan[day]?.['Dinner']) return { day, slot: 'Dinner' };
  }
  for (const day of DAYS) {
    if (!plan[day]?.['Lunch']) return { day, slot: 'Lunch' };
  }
  for (const day of DAYS) {
    if (!plan[day]?.['Breakfast']) return { day, slot: 'Breakfast' };
  }
  return null;
}

export function App() {
  const initial = load();
  const [tab, setTab] = useState<Tab>('week');
  const [plan, setPlan] = useState<Plan>(initial.plan);
  const [pantry, setPantry] = useState<{ name: string }[]>(initial.pantry);
  const [cookedHistory, setCookedHistory] = useState<CookedMealRow[]>(initial.cookedHistory);
  const [leftovers, setLeftovers] = useState<LeftoverRow[]>(initial.leftovers);
  const [fallbackPerServing, setFallbackPerServing] = useState<number>(initial.fallbackPerServing);
  const [currency, setCurrency] = useState<string>(initial.currency);
  const [budgetCap, setBudgetCap] = useState<number | null>(initial.budgetCap);
  const [selectedDay, setSelectedDay] = useState<DayName>(initial.selectedDay);
  const [transferActive, setTransferActive] = useState(false);
  const [recentDrop, setRecentDrop] = useState<string | null>(null);

  // Persist a denormalised snapshot. Keep cookedHistory/leftovers
  // bounded so storage doesn't grow forever.
  useEffect(() => {
    const snapshot: PersistedState = {
      plan,
      pantry,
      cookedHistory: cookedHistory.slice(-30),
      leftovers: leftovers.slice(-20),
      fallbackPerServing,
      currency,
      budgetCap,
      selectedDay,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, [plan, pantry, cookedHistory, leftovers, fallbackPerServing, currency, budgetCap, selectedDay]);

  // Pantry inventory feed.
  useEffect(() => {
    shippie.requestIntent('pantry-inventory');
    return shippie.intent.subscribe('pantry-inventory', ({ rows }) => {
      const items: { name: string }[] = [];
      for (const r of rows) {
        if (r && typeof r === 'object' && 'name' in r) {
          const name = (r as { name?: unknown }).name;
          if (typeof name === 'string') items.push({ name });
        }
      }
      setPantry(items);
    });
  }, []);

  // Cooked-meal log fed back from the recipe app (or any cooking surface).
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
      setCookedHistory((prev) => mergeCookedHistory(prev, next));
    });
  }, []);

  // Budget cap — read-only consumer; we don't push back.
  useEffect(() => {
    shippie.requestIntent('budget-limit');
    return shippie.intent.subscribe('budget-limit', ({ rows }) => {
      for (const row of rows) {
        if (row && typeof row === 'object' && 'amount' in row) {
          const amount = (row as { amount?: unknown }).amount;
          if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) {
            setBudgetCap(amount);
            return;
          }
        }
      }
    });
  }, []);

  // Recipe transfer drop → next empty slot.
  useEffect(() => {
    const offStart = shippie.transfer.onIncomingStart(({ kind }) => {
      if (kind !== 'recipe') return;
      setTransferActive(true);
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
        window.setTimeout(() => setRecentDrop(null), 4000);
        return;
      }
      assignSlot(target.day, target.slot, cell);
      setRecentDrop(`${cell.recipeName} → ${target.day} ${target.slot}`);
      shippie.feel.texture('install');
      window.setTimeout(() => setRecentDrop(null), 4000);
    });
    return () => {
      offStart();
      offCommit();
    };
  }, [plan]);

  // Provide shopping-list whenever the plan/pantry/portion-scaling moves.
  const shopping = useMemo(() => computeShoppingListFromPlan(plan, pantry), [plan, pantry]);
  useEffect(() => {
    if (shopping.length > 0) {
      shippie.intent.broadcast('shopping-list', shopping);
    }
  }, [shopping]);

  // Provide leftover-available whenever the leftover ledger changes.
  useEffect(() => {
    if (leftovers.length > 0) {
      shippie.intent.broadcast('leftover-available', leftovers);
    }
  }, [leftovers]);

  function assignSlot(day: DayName, slot: Slot, cell: PlanCell | null) {
    setPlan((prev) => {
      const dayPlan = { ...(prev[day] ?? {}) };
      if (cell === null) {
        delete dayPlan[slot];
      } else {
        dayPlan[slot] = cell;
      }
      return { ...prev, [day]: dayPlan };
    });
    if (cell) {
      shippie.intent.broadcast('meal-planned', [
        {
          day,
          slot,
          recipeName: cell.recipeName,
          servings: cell.servings,
        },
      ]);
    }
  }

  function moveDay(from: DayName, to: DayName) {
    if (from === to) return;
    setPlan((prev) => {
      const fromPlan = prev[from];
      const toPlan = prev[to];
      // Swap so dragging Tue → Wed actually moves Tue's plan to Wed
      // and Wed's old plan back to Tue.
      return { ...prev, [from]: toPlan, [to]: fromPlan };
    });
    shippie.feel.texture('confirm');
  }

  function markCooked(day: DayName, slot: Slot, cookedFor: number) {
    const cell = plan[day]?.[slot];
    if (!cell) return;
    const cookedAt = new Date();
    setPlan((prev) => {
      const dayPlan = { ...(prev[day] ?? {}) };
      const existing = dayPlan[slot];
      if (!existing) return prev;
      dayPlan[slot] = { ...existing, cooked: true };
      return { ...prev, [day]: dayPlan };
    });
    shippie.intent.broadcast('cooked-meal', [
      {
        title: cell.recipeName,
        cookedAt: cookedAt.toISOString(),
        ingredients: cell.ingredients.map((i) => i.name),
      },
    ]);
    shippie.feel.texture('confirm');

    const leftover = deriveLeftover({
      recipeName: cell.recipeName,
      scaledServings: cell.servings,
      cookedFor,
      cookedAt,
      idSeed: `${day}|${slot}|${cell.recipeName}`,
    });
    if (leftover) {
      setLeftovers((prev) => mergeLeftovers(prev, [leftover]));
    }
  }

  function dismissLeftover(id: string) {
    setLeftovers((prev) => prev.filter((l) => l.id !== id));
  }

  function cookFromTonight(row: CookTonightRow) {
    const target = nextEmptySlot(plan) ?? { day: 'Mon' as DayName, slot: 'Dinner' as Slot };
    const cell = cellFromCandidate(row, 2);
    assignSlot(target.day, target.slot, cell);
    setRecentDrop(`${row.recipeName} → ${target.day} ${target.slot}`);
    setTab('week');
    window.setTimeout(() => setRecentDrop(null), 4000);
  }

  function shiftSelectedDay(delta: -1 | 1) {
    const idx = DAYS.indexOf(selectedDay);
    const nextIdx = Math.min(DAYS.length - 1, Math.max(0, idx + delta));
    const next = DAYS[nextIdx];
    if (next) setSelectedDay(next);
  }

  function clearWeek() {
    setPlan({});
    setLeftovers([]);
  }

  return (
    <main>
      <nav className="topnav" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`navtab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {transferActive ? (
        <div className="transfer-banner" role="status">
          Drop a recipe — it lands in your next open dinner.
        </div>
      ) : null}
      {recentDrop ? (
        <div className="transfer-banner success" role="status">
          ✓ {recentDrop}
        </div>
      ) : null}

      {tab === 'week' ? (
        <Week
          plan={plan}
          pantry={pantry}
          cookedHistory={cookedHistory}
          leftovers={leftovers}
          onSlotChange={assignSlot}
          onMoveDay={moveDay}
          onMarkCooked={markCooked}
          onDismissLeftover={dismissLeftover}
        />
      ) : null}
      {tab === 'day' ? (
        <Day
          day={selectedDay}
          plan={plan}
          onPickSlot={(day, slot) => {
            setSelectedDay(day);
            // Hop to Week so the editor opens there — keeps the editor in one place.
            setTab('week');
            // Use sessionStorage to hint Week which slot to preselect.
            try {
              sessionStorage.setItem('shippie.meal-planner.preselect', JSON.stringify({ day, slot }));
            } catch {
              /* non-fatal */
            }
          }}
          onShiftDay={shiftSelectedDay}
        />
      ) : null}
      {tab === 'cook' ? (
        <CookTonight
          plan={plan}
          cookedHistory={cookedHistory}
          pantry={pantry}
          onCook={cookFromTonight}
        />
      ) : null}
      {tab === 'nutrition' ? (
        <Nutrition
          plan={plan}
          budgetCap={budgetCap}
          fallbackPerServing={fallbackPerServing}
          currency={currency}
        />
      ) : null}
      {tab === 'settings' ? (
        <Settings
          fallbackPerServing={fallbackPerServing}
          currency={currency}
          onChange={({ fallbackPerServing: f, currency: c }) => {
            setFallbackPerServing(f);
            setCurrency(c);
          }}
          onClearWeek={clearWeek}
        />
      ) : null}
    </main>
  );
}

function readRecipePayload(payload: unknown): PlanCell | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  const title = typeof obj.title === 'string' ? obj.title : null;
  const recipeName = typeof obj.recipeName === 'string' ? obj.recipeName : title;
  if (!recipeName) return null;
  const ingredientsRaw = Array.isArray(obj.ingredients) ? obj.ingredients : [];
  const ingredients = ingredientsRaw
    .map((entry) => {
      if (typeof entry === 'string') return { name: entry };
      if (entry && typeof entry === 'object') {
        const name = (entry as { name?: unknown }).name;
        if (typeof name !== 'string') return null;
        const qty = (entry as { quantity?: unknown }).quantity;
        const unit = (entry as { unit?: unknown }).unit;
        return {
          name,
          ...(typeof qty === 'number' && Number.isFinite(qty) ? { quantity: qty } : {}),
          ...(typeof unit === 'string' ? { unit } : {}),
        };
      }
      return null;
    })
    .filter((x): x is { name: string; quantity?: number; unit?: string } => x !== null);
  const servings = typeof obj.servings === 'number' && obj.servings > 0 ? obj.servings : 2;
  const baseServings = servings;
  const nutrition =
    obj.nutrition && typeof obj.nutrition === 'object'
      ? readNutrition(obj.nutrition as Record<string, unknown>)
      : undefined;
  const costPerServing =
    typeof obj.costPerServing === 'number' && Number.isFinite(obj.costPerServing)
      ? obj.costPerServing
      : undefined;
  return {
    recipeName,
    ingredients,
    servings,
    baseServings,
    ...(nutrition ? { nutrition } : {}),
    ...(costPerServing !== undefined ? { costPerServing } : {}),
  };
}

function readNutrition(raw: Record<string, unknown>) {
  const num = (k: string) => {
    const v = raw[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  };
  const calories = num('calories');
  if (calories <= 0) return undefined;
  return {
    calories,
    protein: num('protein'),
    carbs: num('carbs'),
    fat: num('fat'),
    fibre: num('fibre'),
  };
}

function mergeCookedHistory(
  prev: readonly CookedMealRow[],
  next: readonly CookedMealRow[],
): CookedMealRow[] {
  const seen = new Map<string, CookedMealRow>();
  for (const row of prev) seen.set(row.cookedAt + '|' + row.title, row);
  for (const row of next) seen.set(row.cookedAt + '|' + row.title, row);
  return [...seen.values()].sort((a, b) => a.cookedAt.localeCompare(b.cookedAt)).slice(-30);
}

function mergeLeftovers(
  prev: readonly LeftoverRow[],
  next: readonly LeftoverRow[],
): LeftoverRow[] {
  const seen = new Map<string, LeftoverRow>();
  for (const row of prev) seen.set(row.id, row);
  for (const row of next) seen.set(row.id, row);
  return [...seen.values()].sort((a, b) => a.cookedAt.localeCompare(b.cookedAt)).slice(-20);
}

