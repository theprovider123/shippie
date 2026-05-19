import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createLocalNavigation } from '@shippie/sdk/wrapper';

type Tab = 'today' | 'cookbook' | 'plan' | 'pantry' | 'shop' | 'data';
type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type PantryLocation = 'fridge' | 'pantry' | 'freezer' | 'spice-rack';

interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

interface Recipe {
  id: string;
  title: string;
  description: string;
  category: string;
  cuisine: string;
  prepTime: number;
  cookTime: number;
  servings: number;
  ingredients: Ingredient[];
  steps: string[];
  dietaryTags: string[];
  notes?: string;
  photoDataUrl?: string;
  createdAt: number;
  updatedAt: number;
  cookedAt?: number;
  cookCount: number;
  personalFit: number;
}

interface MealPlanEntry {
  id: string;
  date: string;
  mealType: MealType;
  recipeId: string;
  servings: number;
}

interface PantryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  location: PantryLocation;
  expiresOn?: string;
  updatedAt: number;
}

interface ShoppingItem {
  id: string;
  name: string;
  checked: boolean;
  source: 'manual' | 'plan' | 'pantry';
  addedAt: number;
}

interface CookedMeal {
  id: string;
  recipeId: string;
  title: string;
  cookedAt: number;
  servings: number;
}

interface KitchenState {
  recipes: Recipe[];
  mealPlan: MealPlanEntry[];
  pantry: PantryItem[];
  shopping: ShoppingItem[];
  cooked: CookedMeal[];
  defaultServings: number;
  avoid: string[];
}

interface RecipeDraft {
  title: string;
  description: string;
  category: string;
  cuisine: string;
  prepTime: string;
  cookTime: string;
  servings: string;
  ingredients: string;
  steps: string;
  dietaryTags: string;
  notes: string;
  photoDataUrl?: string;
}

const shippie = createShippieIframeSdk({ appId: 'app_recipe' });
const STORAGE_KEY = 'shippie.palate.recipe-hub.v1';
const SEARCH_KEY = 'shippie.palate.recent-searches.v1';
const CATEGORIES = ['Dinner', 'Lunch', 'Breakfast', 'Snack', 'Batch cook'];
const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const LOCATIONS: PantryLocation[] = ['fridge', 'pantry', 'freezer', 'spice-rack'];

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'cookbook', label: 'Cookbook' },
  { id: 'plan', label: 'Plan' },
  { id: 'pantry', label: 'Pantry' },
  { id: 'shop', label: 'Shop' },
  { id: 'data', label: 'Data' },
];

const seedRecipes: Recipe[] = [
  {
    id: 'seed-citrus-salmon',
    title: 'Citrus Salmon Tray Bake',
    description: 'Bright, quick salmon with fennel, potatoes, and a lemon-herb finish.',
    category: 'Dinner',
    cuisine: 'Coastal',
    prepTime: 12,
    cookTime: 24,
    servings: 2,
    ingredients: [
      ingredient('salmon fillets', 2, 'pieces'),
      ingredient('baby potatoes', 450, 'g'),
      ingredient('fennel bulb', 1, 'small'),
      ingredient('lemon', 1, 'whole'),
      ingredient('parsley', 1, 'handful'),
    ],
    steps: [
      'Halve the potatoes and roast with olive oil and salt until nearly tender.',
      'Add sliced fennel and salmon, then roast until the salmon flakes.',
      'Finish with lemon zest, lemon juice, parsley, and a little pan oil.',
    ],
    dietaryTags: ['high protein', 'gluten free'],
    notes: 'Swap fennel for courgette when the fridge is light.',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 6,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 6,
    cookCount: 1,
    cookedAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
    personalFit: 92,
  },
  {
    id: 'seed-silk-tofu-noodles',
    title: 'Silk Tofu Peanut Noodles',
    description: 'Cold noodles, crisp cucumber, herbs, and a glossy peanut-lime sauce.',
    category: 'Lunch',
    cuisine: 'Pan-Asian',
    prepTime: 18,
    cookTime: 6,
    servings: 3,
    ingredients: [
      ingredient('rice noodles', 220, 'g'),
      ingredient('silken tofu', 300, 'g'),
      ingredient('cucumber', 1, 'whole'),
      ingredient('peanut butter', 3, 'tbsp'),
      ingredient('lime', 1, 'whole'),
    ],
    steps: [
      'Cook noodles, rinse cold, and drain well.',
      'Whisk peanut butter, lime, soy, warm water, and chilli crisp.',
      'Fold noodles with cucumber, herbs, tofu, and sauce just before eating.',
    ],
    dietaryTags: ['vegetarian', 'meal prep'],
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
    cookCount: 0,
    personalFit: 86,
  },
  {
    id: 'seed-bean-stew',
    title: 'Sage Butter Bean Stew',
    description: 'Creamy beans with tomato, greens, sage, and a spoon of yoghurt.',
    category: 'Dinner',
    cuisine: 'Rustic',
    prepTime: 10,
    cookTime: 28,
    servings: 4,
    ingredients: [
      ingredient('butter beans', 2, 'tins'),
      ingredient('tomatoes', 1, 'tin'),
      ingredient('kale', 120, 'g'),
      ingredient('sage', 8, 'leaves'),
      ingredient('yoghurt', 4, 'tbsp'),
    ],
    steps: [
      'Soften onion or shallot in oil, then add sage and tomatoes.',
      'Fold in beans and simmer until glossy and thick.',
      'Stir through kale and serve with yoghurt and black pepper.',
    ],
    dietaryTags: ['vegetarian', 'high fibre'],
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 4,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 4,
    cookCount: 2,
    cookedAt: Date.now() - 1000 * 60 * 60 * 24,
    personalFit: 89,
  },
  {
    id: 'seed-cardamom-oats',
    title: 'Cardamom Apple Oats',
    description: 'A quiet breakfast with grated apple, cardamom, toasted seeds, and yoghurt.',
    category: 'Breakfast',
    cuisine: 'Everyday',
    prepTime: 5,
    cookTime: 9,
    servings: 1,
    ingredients: [
      ingredient('oats', 55, 'g'),
      ingredient('apple', 1, 'whole'),
      ingredient('cardamom', 0.5, 'tsp'),
      ingredient('pumpkin seeds', 1, 'tbsp'),
      ingredient('yoghurt', 2, 'tbsp'),
    ],
    steps: [
      'Simmer oats with grated apple, cardamom, water, and a pinch of salt.',
      'Toast seeds in a dry pan while the oats thicken.',
      'Top with yoghurt, seeds, and a little honey if you like.',
    ],
    dietaryTags: ['breakfast', 'high fibre'],
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
    cookCount: 0,
    personalFit: 81,
  },
];

function ingredient(name: string, quantity: number, unit: string): Ingredient {
  return { id: id('ing'), name, quantity, unit };
}

function id(prefix: string): string {
  if ('randomUUID' in crypto) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function readState(): KitchenState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<KitchenState>;
    return {
      ...emptyState(),
      ...parsed,
      recipes: Array.isArray(parsed.recipes) && parsed.recipes.length > 0 ? parsed.recipes : seedRecipes,
      mealPlan: Array.isArray(parsed.mealPlan) ? parsed.mealPlan : [],
      pantry: Array.isArray(parsed.pantry) ? parsed.pantry : [],
      shopping: Array.isArray(parsed.shopping) ? parsed.shopping : [],
      cooked: Array.isArray(parsed.cooked) ? parsed.cooked : [],
      avoid: Array.isArray(parsed.avoid) ? parsed.avoid.filter((x): x is string => typeof x === 'string') : [],
    };
  } catch {
    return emptyState();
  }
}

function emptyState(): KitchenState {
  return {
    recipes: seedRecipes,
    mealPlan: [],
    pantry: [
      { id: id('pantry'), name: 'rice noodles', quantity: 1, unit: 'pack', location: 'pantry', updatedAt: Date.now() },
      { id: id('pantry'), name: 'butter beans', quantity: 2, unit: 'tins', location: 'pantry', updatedAt: Date.now() },
      { id: id('pantry'), name: 'yoghurt', quantity: 1, unit: 'tub', location: 'fridge', updatedAt: Date.now() },
    ],
    shopping: [],
    cooked: [],
    defaultServings: 2,
    avoid: [],
  };
}

function writeState(state: KitchenState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function splitLines(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseIngredientLine(line: string): Ingredient {
  const match = line.match(/^([\d.]+)?\s*([a-zA-Z]+)?\s*(.+)$/);
  if (!match) return ingredient(line, 1, 'ea');
  const quantity = Number(match[1] ?? 1);
  const unit = match[2] ?? 'ea';
  const name = match[3]?.trim() || line;
  return ingredient(name, Number.isFinite(quantity) ? quantity : 1, unit);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

function recipeTotalTime(recipe: Recipe): number {
  return recipe.prepTime + recipe.cookTime;
}

function normaliseName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function planShopping(recipes: Recipe[], entries: MealPlanEntry[], pantry: PantryItem[]): ShoppingItem[] {
  const stocked = new Set(pantry.filter((item) => item.quantity > 0).map((item) => normaliseName(item.name)));
  const needed = new Map<string, ShoppingItem>();
  for (const entry of entries) {
    const recipe = recipes.find((candidate) => candidate.id === entry.recipeId);
    if (!recipe) continue;
    for (const ingredient of recipe.ingredients) {
      const key = normaliseName(ingredient.name);
      if (!key || stocked.has(key) || needed.has(key)) continue;
      needed.set(key, {
        id: `plan_${key.replace(/\s+/g, '-')}`,
        name: ingredient.name,
        checked: false,
        source: 'plan',
        addedAt: Date.now(),
      });
    }
  }
  return [...needed.values()];
}

function recipePayload(recipe: Recipe) {
  return {
    recipeId: recipe.id,
    title: recipe.title,
    cookedAt: new Date().toISOString(),
    ingredients: recipe.ingredients.map((ing) => ({ name: ing.name, quantity: ing.quantity, unit: ing.unit })),
  };
}

export function App() {
  const [state, setState] = useState<KitchenState>(() => readState());
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'today';
    const queryTab = new URL(window.location.href).searchParams.get('tab');
    return TABS.some((candidate) => candidate.id === queryTab) ? (queryTab as Tab) : 'today';
  });
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [cookRecipeId, setCookRecipeId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(SEARCH_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [draft, setDraft] = useState<RecipeDraft>(() => emptyDraft(state.defaultServings));
  const [pantryDraft, setPantryDraft] = useState({ name: '', quantity: '1', unit: 'ea', location: 'pantry' as PantryLocation });
  const [shopDraft, setShopDraft] = useState('');
  const localNavigation = useMemo(() => createLocalNavigation<Tab>('today', setTab), []);

  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  useEffect(() => {
    writeState(state);
  }, [state]);

  useEffect(() => {
    localStorage.setItem(SEARCH_KEY, JSON.stringify(recentSearches.slice(0, 8)));
  }, [recentSearches]);

  useEffect(() => {
    if (state.pantry.length === 0) return;
    shippie.intent.broadcast('pantry-inventory', state.pantry.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      location: item.location,
    })));
    const low = state.pantry.filter((item) => item.quantity <= 1);
    if (low.length > 0) {
      shippie.intent.broadcast('pantry-low', low.map((item) => ({ id: item.id, name: item.name })));
    }
  }, [state.pantry]);

  const selectedRecipe = selectedRecipeId
    ? state.recipes.find((recipe) => recipe.id === selectedRecipeId) ?? null
    : null;
  const cookRecipe = cookRecipeId
    ? state.recipes.find((recipe) => recipe.id === cookRecipeId) ?? null
    : null;

  const filteredRecipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return state.recipes;
    return state.recipes
      .map((recipe) => ({
        recipe,
        score:
          (recipe.title.toLowerCase().includes(q) ? 20 : 0) +
          (recipe.cuisine.toLowerCase().includes(q) ? 8 : 0) +
          (recipe.category.toLowerCase().includes(q) ? 8 : 0) +
          (recipe.dietaryTags.some((tag) => tag.toLowerCase().includes(q)) ? 6 : 0) +
          (recipe.ingredients.some((ing) => ing.name.toLowerCase().includes(q)) ? 10 : 0),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((row) => row.recipe);
  }, [query, state.recipes]);

  const forYou = useMemo(() => {
    const hour = new Date().getHours();
    const preferred = hour < 11 ? 'Breakfast' : hour < 15 ? 'Lunch' : 'Dinner';
    return [...state.recipes]
      .sort((a, b) => {
        const aBoost = a.category === preferred ? 15 : 0;
        const bBoost = b.category === preferred ? 15 : 0;
        return b.personalFit + bBoost - (a.personalFit + aBoost);
      })
      .slice(0, 3);
  }, [state.recipes]);

  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(i)), []);
  const activePlan = state.mealPlan.filter((entry) => dates.includes(entry.date));
  const plannedShopping = useMemo(
    () => planShopping(state.recipes, activePlan, state.pantry),
    [state.recipes, activePlan, state.pantry],
  );
  const shopping = useMemo(() => {
    const byName = new Map<string, ShoppingItem>();
    for (const item of plannedShopping) byName.set(normaliseName(item.name), item);
    for (const item of state.shopping) byName.set(normaliseName(item.name), item);
    return [...byName.values()].sort((a, b) => Number(a.checked) - Number(b.checked));
  }, [plannedShopping, state.shopping]);

  useEffect(() => {
    if (plannedShopping.length > 0) {
      shippie.intent.broadcast('shopping-list', plannedShopping.map((item) => ({ name: item.name, source: item.source })));
    }
  }, [plannedShopping]);

  function navigate(next: Tab): void {
    void localNavigation.navigate(next, { kind: 'crossfade' });
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (next === 'today') url.searchParams.delete('tab');
      else url.searchParams.set('tab', next);
      window.history.replaceState(window.history.state, '', url);
    }
  }

  function saveSearch(value: string): void {
    const trimmed = value.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, 8));
  }

  async function updateDraftPhoto(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setDraft((prev) => ({ ...prev, photoDataUrl: dataUrl }));
  }

  function saveRecipe(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) return;
    const recipe: Recipe = {
      id: id('recipe'),
      title,
      description: draft.description.trim() || 'A personal kitchen note.',
      category: draft.category,
      cuisine: draft.cuisine.trim() || 'Home',
      prepTime: Number(draft.prepTime) || 0,
      cookTime: Number(draft.cookTime) || 0,
      servings: Number(draft.servings) || state.defaultServings,
      ingredients: splitLines(draft.ingredients).map(parseIngredientLine),
      steps: splitLines(draft.steps),
      dietaryTags: splitLines(draft.dietaryTags),
      notes: draft.notes.trim() || undefined,
      photoDataUrl: draft.photoDataUrl,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cookCount: 0,
      personalFit: 72,
    };
    setState((prev) => ({ ...prev, recipes: [recipe, ...prev.recipes] }));
    setDraft(emptyDraft(state.defaultServings));
    setSelectedRecipeId(recipe.id);
    shippie.feel.texture('confirm');
  }

  function planMeal(date: string, mealType: MealType, recipeId: string): void {
    setState((prev) => {
      const withoutSlot = prev.mealPlan.filter((entry) => !(entry.date === date && entry.mealType === mealType));
      if (!recipeId) return { ...prev, mealPlan: withoutSlot };
      const next: MealPlanEntry = {
        id: id('plan'),
        date,
        mealType,
        recipeId,
        servings: prev.defaultServings,
      };
      return { ...prev, mealPlan: [...withoutSlot, next] };
    });
    const recipe = state.recipes.find((candidate) => candidate.id === recipeId);
    if (recipe) {
      shippie.intent.broadcast('meal-planned', [{ recipeId: recipe.id, title: recipe.title, date, mealType }]);
    }
    shippie.feel.texture('toggle');
  }

  function autoPlan(): void {
    const dinnerRecipes = state.recipes.filter((recipe) => recipe.category !== 'Breakfast');
    if (dinnerRecipes.length === 0) return;
    setState((prev) => {
      const nextPlan = prev.mealPlan.filter((entry) => !dates.includes(entry.date));
      dates.forEach((date, index) => {
        const dinner = dinnerRecipes[index % dinnerRecipes.length];
        const lunch = prev.recipes[(index + 1) % prev.recipes.length];
        if (dinner) nextPlan.push({ id: id('plan'), date, mealType: 'dinner', recipeId: dinner.id, servings: prev.defaultServings });
        if (lunch) nextPlan.push({ id: id('plan'), date, mealType: 'lunch', recipeId: lunch.id, servings: prev.defaultServings });
      });
      return { ...prev, mealPlan: nextPlan };
    });
    shippie.feel.texture('install');
  }

  function addPantry(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const name = pantryDraft.name.trim();
    if (!name) return;
    setState((prev) => ({
      ...prev,
      pantry: [
        {
          id: id('pantry'),
          name,
          quantity: Number(pantryDraft.quantity) || 1,
          unit: pantryDraft.unit.trim() || 'ea',
          location: pantryDraft.location,
          updatedAt: Date.now(),
        },
        ...prev.pantry,
      ],
    }));
    setPantryDraft({ name: '', quantity: '1', unit: 'ea', location: 'pantry' });
    shippie.feel.texture('confirm');
  }

  function adjustPantry(itemId: string, delta: number): void {
    setState((prev) => ({
      ...prev,
      pantry: prev.pantry
        .map((item) => item.id === itemId ? { ...item, quantity: Math.max(0, item.quantity + delta), updatedAt: Date.now() } : item)
        .filter((item) => item.quantity > 0 || delta >= 0),
    }));
  }

  function addShopping(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const name = shopDraft.trim();
    if (!name) return;
    const item: ShoppingItem = { id: id('shop'), name, checked: false, source: 'manual', addedAt: Date.now() };
    setState((prev) => ({ ...prev, shopping: [item, ...prev.shopping] }));
    setShopDraft('');
    shippie.intent.broadcast('needs-restocking', [{ name }]);
    shippie.feel.texture('confirm');
  }

  function toggleShopping(item: ShoppingItem): void {
    setState((prev) => ({
      ...prev,
      shopping: prev.shopping.some((candidate) => candidate.id === item.id)
        ? prev.shopping.map((candidate) => candidate.id === item.id ? { ...candidate, checked: !candidate.checked } : candidate)
        : [{ ...item, checked: !item.checked }, ...prev.shopping],
    }));
    shippie.feel.texture('toggle');
  }

  function completeCook(recipe: Recipe, servings: number): void {
    const cookedAt = Date.now();
    setState((prev) => {
      const pantry = prev.pantry.map((item) => {
        const used = recipe.ingredients.some((ing) => normaliseName(ing.name) === normaliseName(item.name));
        return used ? { ...item, quantity: Math.max(0, item.quantity - 1), updatedAt: cookedAt } : item;
      });
      return {
        ...prev,
        pantry,
        recipes: prev.recipes.map((candidate) =>
          candidate.id === recipe.id
            ? { ...candidate, cookCount: candidate.cookCount + 1, cookedAt, personalFit: Math.min(99, candidate.personalFit + 2) }
            : candidate,
        ),
        cooked: [{ id: id('cook'), recipeId: recipe.id, title: recipe.title, cookedAt, servings }, ...prev.cooked].slice(0, 50),
      };
    });
    shippie.intent.broadcast('cooked-meal', [recipePayload(recipe)]);
    shippie.feel.texture('milestone');
    setCookRecipeId(null);
    setSelectedRecipeId(recipe.id);
  }

  function wipeLocalData(): void {
    if (!window.confirm('Clear Palate data on this device?')) return;
    const fresh = emptyState();
    setState(fresh);
    writeState(fresh);
    setSelectedRecipeId(null);
    setCookRecipeId(null);
  }

  return (
    <main className="palate-app">
      <header className="app-header">
        <button className="brand-lockup" type="button" onClick={() => navigate('today')} aria-label="Open Palate today">
          <img src="/brand/palate-logo.png" alt="" />
          <span>
            <strong>Palate</strong>
            <small>Taste-led kitchen</small>
          </span>
        </button>
        <nav aria-label="Palate sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? 'active' : ''}
              onClick={() => navigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'today' ? (
        <TodayView
          state={state}
          forYou={forYou}
          shoppingCount={shopping.filter((item) => !item.checked).length}
          onOpenRecipe={setSelectedRecipeId}
          onCook={setCookRecipeId}
          onNavigate={navigate}
        />
      ) : null}

      {tab === 'cookbook' ? (
        <CookbookView
          recipes={filteredRecipes}
          query={query}
          recentSearches={recentSearches}
          draft={draft}
          onDraftChange={setDraft}
          onPhotoChange={updateDraftPhoto}
          onSaveRecipe={saveRecipe}
          onQuery={(value) => {
            setQuery(value);
            if (value.trim().length > 2) saveSearch(value);
          }}
          onOpenRecipe={setSelectedRecipeId}
          onCook={setCookRecipeId}
        />
      ) : null}

      {tab === 'plan' ? (
        <PlanView
          dates={dates}
          mealPlan={state.mealPlan}
          recipes={state.recipes}
          onPlan={planMeal}
          onAutoPlan={autoPlan}
        />
      ) : null}

      {tab === 'pantry' ? (
        <PantryView
          pantry={state.pantry}
          draft={pantryDraft}
          onDraftChange={setPantryDraft}
          onAdd={addPantry}
          onAdjust={adjustPantry}
        />
      ) : null}

      {tab === 'shop' ? (
        <ShoppingView
          shopping={shopping}
          draft={shopDraft}
          onDraftChange={setShopDraft}
          onAdd={addShopping}
          onToggle={toggleShopping}
        />
      ) : null}

      {tab === 'data' ? (
        <DataView state={state} onWipe={wipeLocalData} />
      ) : null}

      {selectedRecipe ? (
        <RecipeSheet
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipeId(null)}
          onCook={() => setCookRecipeId(selectedRecipe.id)}
        />
      ) : null}

      {cookRecipe ? (
        <CookMode recipe={cookRecipe} onClose={() => setCookRecipeId(null)} onComplete={completeCook} />
      ) : null}
    </main>
  );
}

function emptyDraft(defaultServings: number): RecipeDraft {
  return {
    title: '',
    description: '',
    category: 'Dinner',
    cuisine: '',
    prepTime: '10',
    cookTime: '25',
    servings: String(defaultServings),
    ingredients: '',
    steps: '',
    dietaryTags: '',
    notes: '',
  };
}

function TodayView({
  state,
  forYou,
  shoppingCount,
  onOpenRecipe,
  onCook,
  onNavigate,
}: {
  state: KitchenState;
  forYou: Recipe[];
  shoppingCount: number;
  onOpenRecipe: (recipeId: string) => void;
  onCook: (recipeId: string) => void;
  onNavigate: (tab: Tab) => void;
}) {
  const cookedThisWeek = state.cooked.filter((meal) => Date.now() - meal.cookedAt < 7 * 24 * 60 * 60 * 1000).length;
  const todaysPlan = state.mealPlan.filter((entry) => entry.date === today());
  const pantryLow = state.pantry.filter((item) => item.quantity <= 1);
  const firstPick = forYou[0] ?? state.recipes[0];
  return (
    <section className="page-shell today-shell">
      <div className="hero-plane">
        <div>
          <p className="eyebrow">Palate</p>
          <h1>Taste first. Cook next.</h1>
          <p>Choose a flavour, check what is in the kitchen, and turn the week into food without an account.</p>
          <div className="hero-actions">
            <button type="button" className="primary" onClick={() => firstPick ? onCook(firstPick.id) : onNavigate('cookbook')}>Cook now</button>
            <button type="button" onClick={() => onNavigate('cookbook')}>Add recipe</button>
            <button type="button" onClick={() => onNavigate('plan')}>Plan week</button>
          </div>
        </div>
        <TasteBoard recipes={forYou} pantryLow={pantryLow.length} shoppingCount={shoppingCount} onCook={onCook} />
      </div>

      <section className="metric-strip" aria-label="Kitchen status">
        <div><strong>{state.recipes.length}</strong><span>recipes saved</span></div>
        <div><strong>{cookedThisWeek}</strong><span>cooks this week</span></div>
        <div><strong>{todaysPlan.length}</strong><span>meals today</span></div>
        <div><strong>{shoppingCount}</strong><span>shop items</span></div>
      </section>

      <section className="split-layout">
        <div>
          <SectionHeading title="What tastes right" action="Fit score" />
          <div className="recipe-rail">
            {forYou.map((recipe) => (
              <RecipeTile key={recipe.id} recipe={recipe} onOpen={onOpenRecipe} onCook={onCook} />
            ))}
          </div>
        </div>
        <aside className="quiet-panel">
          <h2>Today’s table</h2>
          {todaysPlan.length === 0 ? (
            <>
              <p>Nothing plated yet.</p>
              <button type="button" className="text-action" onClick={() => onNavigate('plan')}>Plan today</button>
            </>
          ) : (
            <ul className="plain-list">
              {todaysPlan.map((entry) => {
                const recipe = state.recipes.find((candidate) => candidate.id === entry.recipeId);
                return <li key={entry.id}><span>{entry.mealType}</span><strong>{recipe?.title ?? 'Missing recipe'}</strong></li>;
              })}
            </ul>
          )}
          {pantryLow.length > 0 ? (
            <p className="soft-warning">{pantryLow.length} pantry item{pantryLow.length === 1 ? '' : 's'} running low.</p>
          ) : null}
        </aside>
      </section>
    </section>
  );
}

function TasteBoard({
  recipes,
  pantryLow,
  shoppingCount,
  onCook,
}: {
  recipes: Recipe[];
  pantryLow: number;
  shoppingCount: number;
  onCook: (recipeId: string) => void;
}) {
  const featured = recipes[0];
  const notes = [...new Set((featured?.ingredients ?? []).map((ingredient) => ingredient.name).slice(0, 6))];
  return (
    <section className="taste-board" aria-label="Taste board">
      <div className="taste-board-plate">
        <img src="/brand/palate-logo.png" alt="" />
      </div>
      <div className="taste-board-content">
        <p className="eyebrow">Next flavour</p>
        <h2>{featured?.title ?? 'Start with a recipe'}</h2>
        <div className="flavour-notes" aria-label="Flavour notes">
          {(notes.length > 0 ? notes : ['citrus', 'sage', 'apple']).map((note) => <span key={note}>{note}</span>)}
        </div>
        <div className="taste-board-status">
          <span><strong>{featured ? recipeTotalTime(featured) : 0}</strong> min</span>
          <span><strong>{pantryLow}</strong> low</span>
          <span><strong>{shoppingCount}</strong> shop</span>
        </div>
        <button type="button" className="primary" onClick={() => featured ? onCook(featured.id) : undefined} disabled={!featured}>Start cooking</button>
      </div>
    </section>
  );
}

function CookbookView({
  recipes,
  query,
  recentSearches,
  draft,
  onDraftChange,
  onPhotoChange,
  onSaveRecipe,
  onQuery,
  onOpenRecipe,
  onCook,
}: {
  recipes: Recipe[];
  query: string;
  recentSearches: string[];
  draft: RecipeDraft;
  onDraftChange: (draft: RecipeDraft) => void;
  onPhotoChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onSaveRecipe: (event: FormEvent<HTMLFormElement>) => void;
  onQuery: (value: string) => void;
  onOpenRecipe: (recipeId: string) => void;
  onCook: (recipeId: string) => void;
}) {
  return (
    <section className="page-shell">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Cookbook</p>
          <h1>Save the dishes worth repeating.</h1>
        </div>
        <label className="search-box">
          <span>Search</span>
          <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="ingredient, cuisine, tag" />
        </label>
      </div>
      {recentSearches.length > 0 ? (
        <div className="chip-row" aria-label="Recent searches">
          {recentSearches.map((search) => (
            <button key={search} type="button" onClick={() => onQuery(search)}>{search}</button>
          ))}
        </div>
      ) : null}
      <div className="cookbook-grid">
        <div className="recipe-list">
          {recipes.map((recipe) => (
            <RecipeRow key={recipe.id} recipe={recipe} onOpen={onOpenRecipe} onCook={onCook} />
          ))}
        </div>
        <form className="recipe-editor" onSubmit={onSaveRecipe}>
          <h2>Add recipe</h2>
          <input value={draft.title} onChange={(event) => onDraftChange({ ...draft, title: event.target.value })} placeholder="Title" required />
          <textarea value={draft.description} onChange={(event) => onDraftChange({ ...draft, description: event.target.value })} placeholder="What makes it yours?" />
          <div className="form-grid">
            <select value={draft.category} onChange={(event) => onDraftChange({ ...draft, category: event.target.value })}>
              {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
            </select>
            <input value={draft.cuisine} onChange={(event) => onDraftChange({ ...draft, cuisine: event.target.value })} placeholder="Cuisine" />
            <input value={draft.prepTime} onChange={(event) => onDraftChange({ ...draft, prepTime: event.target.value })} inputMode="numeric" placeholder="Prep min" />
            <input value={draft.cookTime} onChange={(event) => onDraftChange({ ...draft, cookTime: event.target.value })} inputMode="numeric" placeholder="Cook min" />
            <input value={draft.servings} onChange={(event) => onDraftChange({ ...draft, servings: event.target.value })} inputMode="numeric" placeholder="Servings" />
            <label className="file-pill">
              Photo
              <input type="file" accept="image/*" onChange={(event) => void onPhotoChange(event)} />
            </label>
          </div>
          <textarea value={draft.ingredients} onChange={(event) => onDraftChange({ ...draft, ingredients: event.target.value })} placeholder="Ingredients, one per line. Example: 2 tbsp olive oil" rows={5} />
          <textarea value={draft.steps} onChange={(event) => onDraftChange({ ...draft, steps: event.target.value })} placeholder="Steps, one per line" rows={5} />
          <input value={draft.dietaryTags} onChange={(event) => onDraftChange({ ...draft, dietaryTags: event.target.value })} placeholder="Tags: vegetarian, quick, high fibre" />
          <textarea value={draft.notes} onChange={(event) => onDraftChange({ ...draft, notes: event.target.value })} placeholder="Private notes" />
          {draft.photoDataUrl ? <img className="draft-photo" src={draft.photoDataUrl} alt="" /> : null}
          <button type="submit" className="primary">Save recipe</button>
        </form>
      </div>
    </section>
  );
}

function PlanView({
  dates,
  mealPlan,
  recipes,
  onPlan,
  onAutoPlan,
}: {
  dates: string[];
  mealPlan: MealPlanEntry[];
  recipes: Recipe[];
  onPlan: (date: string, mealType: MealType, recipeId: string) => void;
  onAutoPlan: () => void;
}) {
  return (
    <section className="page-shell">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Plan</p>
          <h1>Turn cravings into a week.</h1>
        </div>
        <button type="button" className="primary" onClick={onAutoPlan}>Fill week</button>
      </div>
      <div className="plan-board">
        {dates.map((date) => (
          <section key={date} className="plan-day">
            <h2>{formatDay(date)}</h2>
            {MEALS.map((meal) => {
              const entry = mealPlan.find((candidate) => candidate.date === date && candidate.mealType === meal);
              return (
                <label key={meal} className="plan-slot">
                  <span>{meal}</span>
                  <select value={entry?.recipeId ?? ''} onChange={(event) => onPlan(date, meal, event.target.value)}>
                    <option value="">Choose recipe</option>
                    {recipes.map((recipe) => <option value={recipe.id} key={recipe.id}>{recipe.title}</option>)}
                  </select>
                </label>
              );
            })}
          </section>
        ))}
      </div>
    </section>
  );
}

function PantryView({
  pantry,
  draft,
  onDraftChange,
  onAdd,
  onAdjust,
}: {
  pantry: PantryItem[];
  draft: { name: string; quantity: string; unit: string; location: PantryLocation };
  onDraftChange: (draft: { name: string; quantity: string; unit: string; location: PantryLocation }) => void;
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  onAdjust: (itemId: string, delta: number) => void;
}) {
  return (
    <section className="page-shell">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Pantry</p>
          <h1>Start from what is here.</h1>
        </div>
        <form className="inline-form" onSubmit={onAdd}>
          <input value={draft.name} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} placeholder="Item" required />
          <input value={draft.quantity} onChange={(event) => onDraftChange({ ...draft, quantity: event.target.value })} inputMode="decimal" />
          <input value={draft.unit} onChange={(event) => onDraftChange({ ...draft, unit: event.target.value })} />
          <select value={draft.location} onChange={(event) => onDraftChange({ ...draft, location: event.target.value as PantryLocation })}>
            {LOCATIONS.map((loc) => <option key={loc}>{loc}</option>)}
          </select>
          <button type="submit" className="primary">Add</button>
        </form>
      </div>
      <div className="inventory-table">
        {pantry.map((item) => (
          <div className="inventory-row" key={item.id}>
            <strong>{item.name}</strong>
            <span>{item.quantity} {item.unit}</span>
            <span>{item.location}</span>
            <div>
              <button type="button" aria-label={`Decrease ${item.name}`} onClick={() => onAdjust(item.id, -1)}>-</button>
              <button type="button" aria-label={`Increase ${item.name}`} onClick={() => onAdjust(item.id, 1)}>+</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ShoppingView({
  shopping,
  draft,
  onDraftChange,
  onAdd,
  onToggle,
}: {
  shopping: ShoppingItem[];
  draft: string;
  onDraftChange: (value: string) => void;
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  onToggle: (item: ShoppingItem) => void;
}) {
  return (
    <section className="page-shell">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Shop</p>
          <h1>Buy only what the week needs.</h1>
        </div>
        <form className="inline-form compact" onSubmit={onAdd}>
          <input value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder="Add item" />
          <button type="submit" className="primary">Add</button>
        </form>
      </div>
      <div className="shopping-list">
        {shopping.length === 0 ? <p className="empty">Plan meals or add a pantry low to build a list.</p> : null}
        {shopping.map((item) => (
          <button key={item.id} type="button" className={item.checked ? 'checked' : ''} onClick={() => onToggle(item)}>
            <span>{item.checked ? '✓' : ''}</span>
            <strong>{item.name}</strong>
            <small>{item.source}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function DataView({ state, onWipe }: { state: KitchenState; onWipe: () => void }) {
  const bytes = new Blob([JSON.stringify(state)]).size;
  return (
    <section className="page-shell data-page">
      <p className="eyebrow">Local data</p>
      <h1>No Palate account. No Supabase.</h1>
      <p className="measure">
        Recipes, pantry, meal plan, shopping, and photos are stored in this browser on this device.
        Shippie hosts the app package; your kitchen data does not live in a Shippie database.
      </p>
      <section className="metric-strip">
        <div><strong>{state.recipes.length}</strong><span>recipes</span></div>
        <div><strong>{state.pantry.length}</strong><span>pantry rows</span></div>
        <div><strong>{Math.ceil(bytes / 1024)} KB</strong><span>local payload</span></div>
      </section>
      <button type="button" className="danger" onClick={onWipe}>Clear this device</button>
    </section>
  );
}

function SectionHeading({ title, action }: { title: string; action?: string }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {action ? <span>{action}</span> : null}
    </div>
  );
}

function RecipeTile({ recipe, onOpen, onCook }: { recipe: Recipe; onOpen: (recipeId: string) => void; onCook: (recipeId: string) => void }) {
  return (
    <article className="recipe-tile">
      {recipe.photoDataUrl ? <img src={recipe.photoDataUrl} alt="" /> : <div className="recipe-mark">{recipe.title.slice(0, 1)}</div>}
      <button type="button" className="tile-body" onClick={() => onOpen(recipe.id)}>
        <span>{recipe.category} · {recipeTotalTime(recipe)} min</span>
        <strong>{recipe.title}</strong>
        <small>{recipe.personalFit}% personal fit</small>
      </button>
      <button type="button" className="cook-button" onClick={() => onCook(recipe.id)}>Cook</button>
    </article>
  );
}

function RecipeRow({ recipe, onOpen, onCook }: { recipe: Recipe; onOpen: (recipeId: string) => void; onCook: (recipeId: string) => void }) {
  return (
    <article className="recipe-row">
      {recipe.photoDataUrl ? <img src={recipe.photoDataUrl} alt="" /> : <div className="recipe-mark">{recipe.title.slice(0, 1)}</div>}
      <button type="button" onClick={() => onOpen(recipe.id)}>
        <strong>{recipe.title}</strong>
        <span>{recipe.cuisine} · {recipeTotalTime(recipe)} min · serves {recipe.servings}</span>
      </button>
      <small>{recipe.cookCount} cooks</small>
      <button type="button" className="primary small" onClick={() => onCook(recipe.id)}>Cook</button>
    </article>
  );
}

function RecipeSheet({ recipe, onClose, onCook }: { recipe: Recipe; onClose: () => void; onCook: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <section className="recipe-sheet" role="dialog" aria-label={recipe.title} onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">{recipe.category} · {recipeTotalTime(recipe)} min</p>
            <h1>{recipe.title}</h1>
            <p>{recipe.description}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="sheet-grid">
          <section>
            <h2>Ingredients</h2>
            <ul>
              {recipe.ingredients.map((ing) => <li key={ing.id}>{ing.quantity} {ing.unit} {ing.name}</li>)}
            </ul>
          </section>
          <section>
            <h2>Method</h2>
            <ol>
              {recipe.steps.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}
            </ol>
          </section>
        </div>
        {recipe.notes ? <p className="note">{recipe.notes}</p> : null}
        <button type="button" className="primary" onClick={onCook}>Start cooking</button>
      </section>
    </div>
  );
}

function CookMode({ recipe, onClose, onComplete }: { recipe: Recipe; onClose: () => void; onComplete: (recipe: Recipe, servings: number) => void }) {
  const [step, setStep] = useState(0);
  const [servings, setServings] = useState(recipe.servings);
  const current = recipe.steps[step] ?? 'Plate, taste, and make it yours.';
  return (
    <div className="cook-mode" data-shippie-wakelock>
      <header>
        <button type="button" onClick={onClose}>Exit</button>
        <div>
          <p>{step + 1} / {Math.max(recipe.steps.length, 1)}</p>
          <h1>{recipe.title}</h1>
        </div>
        <label>
          Serves
          <input value={servings} onChange={(event) => setServings(Number(event.target.value) || 1)} inputMode="numeric" />
        </label>
      </header>
      <section className="cook-step">
        <p>{current}</p>
      </section>
      <footer>
        <button type="button" disabled={step === 0} onClick={() => setStep((prev) => Math.max(0, prev - 1))}>Back</button>
        {step < recipe.steps.length - 1 ? (
          <button type="button" className="primary" onClick={() => setStep((prev) => prev + 1)}>Next</button>
        ) : (
          <button type="button" className="primary" onClick={() => onComplete(recipe, servings)}>Mark cooked</button>
        )}
      </footer>
    </div>
  );
}
