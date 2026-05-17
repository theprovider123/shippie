import { useEffect, useMemo, useState, type FormEvent } from 'react';

const MEAL_PLANNER_KEY = 'shippie.meal-planner.v2';
const SHOPPING_LIST_KEY = 'shippie.shopping-list.v1';
const PANTRY_ITEMS_KEY = 'shippie.pantry-scanner.v1';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const SLOTS = ['Breakfast', 'Lunch', 'Dinner'] as const;
const LOCATIONS = ['fridge', 'pantry', 'freezer', 'spice-rack'] as const;

type Day = (typeof DAYS)[number];
type Slot = (typeof SLOTS)[number];
type Location = (typeof LOCATIONS)[number];

interface MealPlanCell {
  recipeName: string;
  servings?: number;
  baseServings?: number;
  ingredients?: Array<{ name: string; quantity?: number; unit?: string }>;
}

interface MealPlannerState {
  plan: Partial<Record<Day, Partial<Record<Slot, MealPlanCell>>>>;
  pantry: { name: string }[];
  cookedHistory: unknown[];
  leftovers: unknown[];
  fallbackPerServing: number;
  currency: string;
  budgetCap: number | null;
  selectedDay: Day;
}

interface ShoppingItem {
  id: string;
  name: string;
  checked: boolean;
  source?: string;
  addedAt?: string;
}

interface PantryItem {
  id: string;
  name: string;
  nameKey: string;
  barcode?: string;
  quantity: number;
  unit: string;
  expiresOn?: string;
  location: Location;
  notes?: string;
  addedAt: string;
  updatedAt: string;
}

function safeRead<T>(key: string, fallback: T, normalise: (value: unknown) => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return normalise(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* local-only tools tolerate unavailable storage */
  }
}

function emptyMealState(): MealPlannerState {
  return {
    plan: {},
    pantry: [],
    cookedHistory: [],
    leftovers: [],
    fallbackPerServing: 4,
    currency: '',
    budgetCap: null,
    selectedDay: 'Mon',
  };
}

function loadMealState(): MealPlannerState {
  return safeRead(MEAL_PLANNER_KEY, emptyMealState(), (value) => {
    const parsed = value && typeof value === 'object' ? (value as Partial<MealPlannerState>) : {};
    return {
      ...emptyMealState(),
      ...parsed,
      plan: parsed.plan && typeof parsed.plan === 'object' ? parsed.plan : {},
      pantry: Array.isArray(parsed.pantry) ? parsed.pantry : [],
      cookedHistory: Array.isArray(parsed.cookedHistory) ? parsed.cookedHistory : [],
      leftovers: Array.isArray(parsed.leftovers) ? parsed.leftovers : [],
      selectedDay: DAYS.includes(parsed.selectedDay as Day) ? (parsed.selectedDay as Day) : 'Mon',
    };
  });
}

function loadShoppingItems(): ShoppingItem[] {
  return safeRead(SHOPPING_LIST_KEY, [], (value) => {
    if (!Array.isArray(value)) return [];
    return value
      .map((item): ShoppingItem | null => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        if (typeof row.id !== 'string' || typeof row.name !== 'string') return null;
        return {
          id: row.id,
          name: row.name,
          checked: row.checked === true,
          source: typeof row.source === 'string' ? row.source : 'manual',
          addedAt: typeof row.addedAt === 'string' ? row.addedAt : new Date().toISOString(),
        };
      })
      .filter((item): item is ShoppingItem => item !== null);
  });
}

function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function readLocation(value: unknown): Location {
  return LOCATIONS.includes(value as Location) ? (value as Location) : 'pantry';
}

function loadPantryItems(): PantryItem[] {
  return safeRead(PANTRY_ITEMS_KEY, [], (value) => {
    if (!Array.isArray(value)) return [];
    return value
      .map((item): PantryItem | null => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        if (typeof row.id !== 'string' || typeof row.name !== 'string') return null;
        const addedAt = typeof row.addedAt === 'string' ? row.addedAt : new Date().toISOString();
        return {
          id: row.id,
          name: row.name,
          nameKey: typeof row.nameKey === 'string' ? row.nameKey : nameKey(row.name),
          barcode: typeof row.barcode === 'string' ? row.barcode : undefined,
          quantity: typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : 1,
          unit: typeof row.unit === 'string' ? row.unit : 'ea',
          expiresOn: typeof row.expiresOn === 'string' ? row.expiresOn : undefined,
          location: readLocation(row.location),
          notes: typeof row.notes === 'string' ? row.notes : undefined,
          addedAt,
          updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : addedAt,
        };
      })
      .filter((item): item is PantryItem => item !== null);
  });
}

export function MealPlanTab() {
  const [state, setState] = useState<MealPlannerState>(() => loadMealState());

  useEffect(() => {
    safeWrite(MEAL_PLANNER_KEY, state);
  }, [state]);

  function updateSlot(day: Day, slot: Slot, recipeName: string): void {
    setState((prev) => {
      const plan = { ...prev.plan };
      const dayPlan = { ...(plan[day] ?? {}) };
      const current = dayPlan[slot];
      if (recipeName.trim()) {
        dayPlan[slot] = {
          ...(current ?? { servings: 2, baseServings: 2, ingredients: [] }),
          recipeName: recipeName.trimStart(),
        };
      } else {
        delete dayPlan[slot];
      }
      plan[day] = dayPlan;
      return { ...prev, plan, selectedDay: day };
    });
  }

  const plannedCount = useMemo(
    () =>
      DAYS.reduce(
        (total, day) => total + SLOTS.filter((slot) => state.plan[day]?.[slot]?.recipeName).length,
        0,
      ),
    [state.plan],
  );

  return (
    <section className="integrated-page" aria-labelledby="meal-plan-title">
      <header className="page-header">
        <div className="page-header-titles">
          <h1 id="meal-plan-title">Meal Plan</h1>
          <p className="page-header-count">{plannedCount} planned meals</p>
        </div>
        <button type="button" className="ghost" onClick={() => setState((prev) => ({ ...prev, plan: {} }))}>
          Clear
        </button>
      </header>
      <div className="meal-grid" role="table" aria-label="Weekly meal plan">
        {DAYS.map((day) => (
          <section className="meal-day" key={day}>
            <h2>{day}</h2>
            {SLOTS.map((slot) => (
              <label key={slot} className="meal-slot">
                <span>{slot}</span>
                <input
                  value={state.plan[day]?.[slot]?.recipeName ?? ''}
                  onChange={(event) => updateSlot(day, slot, event.target.value)}
                  placeholder="Recipe or idea"
                />
              </label>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}

export function ShoppingTab() {
  const [items, setItems] = useState<ShoppingItem[]>(() => loadShoppingItems());
  const [draft, setDraft] = useState('');
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  useEffect(() => {
    safeWrite(SHOPPING_LIST_KEY, items);
  }, [items]);

  function addItem(event: FormEvent): void {
    event.preventDefault();
    const name = draft.trim();
    if (!name) return;
    setItems((prev) => [
      {
        id: `i_${Date.now()}`,
        name,
        checked: false,
        source: 'manual',
        addedAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setDraft('');
  }

  async function shareList(): Promise<void> {
    const openItems = items.filter((item) => !item.checked).map((item) => `- ${item.name}`);
    const text = openItems.length > 0 ? openItems.join('\n') : 'Shopping list is complete.';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Shopping list', text });
      } else {
        await navigator.clipboard?.writeText(text);
        setShareStatus('Copied list.');
      }
    } catch {
      setShareStatus('Share cancelled.');
    }
  }

  const remaining = items.filter((item) => !item.checked).length;

  return (
    <section className="integrated-page" aria-labelledby="shopping-title">
      <header className="page-header">
        <div className="page-header-titles">
          <h1 id="shopping-title">Shopping</h1>
          <p className="page-header-count">{remaining} of {items.length} still to get</p>
        </div>
        <button type="button" className="primary" onClick={() => void shareList()}>
          Share
        </button>
      </header>
      <form className="inline-add" onSubmit={addItem}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add an item"
          aria-label="New shopping item"
        />
        <button type="submit">Add</button>
      </form>
      <ul className="simple-list" aria-label="Shopping list">
        {items.map((item) => (
          <li key={item.id} className={item.checked ? 'complete' : ''}>
            <button
              type="button"
              onClick={() =>
                setItems((prev) =>
                  prev.map((candidate) =>
                    candidate.id === item.id ? { ...candidate, checked: !candidate.checked } : candidate,
                  ),
                )
              }
              aria-pressed={item.checked}
            >
              <span className="checkmark">{item.checked ? '✓' : ''}</span>
              <span>{item.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {items.length === 0 ? <p className="empty-inline">Add items here, or let Meal Plan fill this list later.</p> : null}
      <div className="tab-actions">
        <button
          type="button"
          className="ghost"
          disabled={items.every((item) => !item.checked)}
          onClick={() => setItems((prev) => prev.filter((item) => !item.checked))}
        >
          Clear checked
        </button>
        {shareStatus ? <p role="status">{shareStatus}</p> : null}
      </div>
    </section>
  );
}

export function PantryTab() {
  const [items, setItems] = useState<PantryItem[]>(() => loadPantryItems());
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('ea');
  const [location, setLocation] = useState<Location>('pantry');
  const [cameraStatus, setCameraStatus] = useState<string | null>(null);

  useEffect(() => {
    safeWrite(PANTRY_ITEMS_KEY, items);
  }, [items]);

  function addItem(event: FormEvent): void {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const parsedQuantity = Number.parseFloat(quantity);
    setItems((prev) => [
      {
        id: `p_${Date.now()}`,
        name: trimmed,
        nameKey: nameKey(trimmed),
        quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1,
        unit: unit.trim() || 'ea',
        location,
        addedAt: now,
        updatedAt: now,
      },
      ...prev,
    ]);
    setName('');
    setQuantity('1');
  }

  async function requestCamera(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('Camera is not available in this browser.');
      return;
    }
    try {
      setCameraStatus('Opening camera…');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      stream.getTracks().forEach((track) => track.stop());
      setCameraStatus('Camera ready. Use Pantry Scanner if you need full barcode capture.');
    } catch {
      setCameraStatus('Camera permission was not granted.');
    }
  }

  return (
    <section className="integrated-page" aria-labelledby="pantry-title">
      <header className="page-header">
        <div className="page-header-titles">
          <h1 id="pantry-title">Pantry</h1>
          <p className="page-header-count">{items.length} saved items</p>
        </div>
        <button type="button" className="primary" onClick={() => void requestCamera()}>
          Scan
        </button>
      </header>
      <form className="pantry-add" onSubmit={addItem}>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Item" aria-label="Pantry item" />
        <input
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          inputMode="decimal"
          aria-label="Quantity"
        />
        <input value={unit} onChange={(event) => setUnit(event.target.value)} aria-label="Unit" />
        <select value={location} onChange={(event) => setLocation(readLocation(event.target.value))} aria-label="Location">
          {LOCATIONS.map((option) => (
            <option key={option} value={option}>{option.replace('-', ' ')}</option>
          ))}
        </select>
        <button type="submit">Add</button>
      </form>
      {cameraStatus ? <p className="camera-status" role="status">{cameraStatus}</p> : null}
      <ul className="pantry-list" aria-label="Pantry inventory">
        {items.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <span>{item.quantity} {item.unit} · {item.location.replace('-', ' ')}</span>
            </div>
            <button type="button" className="ghost" onClick={() => setItems((prev) => prev.filter((row) => row.id !== item.id))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      {items.length === 0 ? <p className="empty-inline">Add pantry staples here; older Pantry Scanner items appear automatically.</p> : null}
    </section>
  );
}
