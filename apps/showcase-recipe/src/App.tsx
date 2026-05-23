import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createLocalNavigation } from '@shippie/sdk/wrapper';
import {
  BackupCard,
  EmptyState,
  IntentToastHost,
  QrShareSheet,
  type IntentLike,
  type IntentSubscription,
} from '@shippie/showcase-kit-v2';
import {
  CookAlongView,
  COOKING_NOW_INTENT,
  COOK_SESSION_TTL_MS,
  createCookAlongClient,
  loadOrCreatePeerId,
  newCookSessionId,
  useCookAlongPeer,
  type CookAlongPayload,
} from './CookAlong.tsx';
import { CookRecapSheet } from './CookRecap.tsx';
import { palateMatchers } from './IntentMatchers.ts';
import { createPalateBackupStore } from './PalateBackupAdapter.ts';
import { parseRecipeText, type ParsedRecipe } from './recipe-import.ts';

type Tab = 'today' | 'cookbook' | 'plan' | 'pantry' | 'shop' | 'data';
type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type PantryLocation = 'fridge' | 'pantry' | 'freezer' | 'spice-rack';

const PANTRY_LOCATION_BADGES: Record<PantryLocation, { icon: string; label: string }> = {
  fridge: { icon: '🥶', label: 'fridge' },
  pantry: { icon: '🥫', label: 'pantry' },
  freezer: { icon: '❄', label: 'freezer' },
  'spice-rack': { icon: '🌿', label: 'spice rack' },
};

const MEAL_TONE: Record<MealType, string> = {
  breakfast: 'meal-breakfast',
  lunch: 'meal-lunch',
  dinner: 'meal-dinner',
  snack: 'meal-snack',
};

const SHOP_AISLES: Array<{ key: string; label: string; matchers: RegExp }> = [
  { key: 'produce', label: 'Produce', matchers: /\b(apple|lemon|fennel|kale|cucumber|herbs?|parsley|sage|cardamom|garlic|onion|tomato|courgette)\b/i },
  { key: 'dairy', label: 'Dairy', matchers: /\b(yogh?urt|milk|butter|cheese|cream|tofu)\b/i },
  { key: 'dry', label: 'Dry goods', matchers: /\b(rice|oats|noodle|beans?|peanut|seed|spice|flour|pasta)\b/i },
  { key: 'frozen', label: 'Frozen', matchers: /\b(frozen|ice|berry)\b/i },
];

const SOURCE_BADGE: Record<ShoppingItem['source'], { label: string; tone: string }> = {
  manual: { label: 'manual', tone: 'badge-manual' },
  plan: { label: 'planned', tone: 'badge-plan' },
  pantry: { label: 'pantry gap', tone: 'badge-pantry' },
};

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

interface PantryDraft {
  name: string;
  quantity: string;
  unit: string;
  location: PantryLocation;
  expiresOn: string;
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

const shippie = createShippieIframeSdk({ appId: 'app_palate' });
const STORAGE_KEY = 'shippie.palate.recipe-hub.v1';
const SEARCH_KEY = 'shippie.palate.recent-searches.v1';
const CATEGORIES = ['Dinner', 'Lunch', 'Breakfast', 'Snack', 'Batch cook'];
const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const LOCATIONS: PantryLocation[] = ['fridge', 'pantry', 'freezer', 'spice-rack'];

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'cookbook', label: 'Recipes' },
  { id: 'plan', label: 'Plan' },
  { id: 'pantry', label: 'Pantry' },
  { id: 'shop', label: 'Shop' },
  { id: 'data', label: 'Data' },
];
const PALATE_LOGO_URL = `${import.meta.env.BASE_URL}brand/palate-logo.png`;

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

/**
 * Render a scaled ingredient quantity legibly. Scaling produces awkward
 * decimals (0.5 → "½", 1.333 → "1⅓"), so we snap to common kitchen
 * fractions and trim trailing zeros for everything else.
 */
function formatQuantity(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const whole = Math.floor(value);
  const frac = value - whole;
  const fractions: Array<[number, string]> = [
    [0, ''],
    [0.25, '¼'],
    [1 / 3, '⅓'],
    [0.5, '½'],
    [2 / 3, '⅔'],
    [0.75, '¾'],
    [1, ''],
  ];
  let best = fractions[0]!;
  for (const candidate of fractions) {
    if (Math.abs(candidate[0] - frac) < Math.abs(best[0] - frac)) best = candidate;
  }
  if (best[0] === 1) return String(whole + 1);
  if (best[1]) return whole > 0 ? `${whole}${best[1]}` : best[1];
  if (whole > 0) return String(whole);
  return String(Number(value.toFixed(2)));
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
  const [importOpen, setImportOpen] = useState(false);
  const [pantryDraft, setPantryDraft] = useState<PantryDraft>({ name: '', quantity: '1', unit: 'ea', location: 'pantry', expiresOn: '' });
  const [shopDraft, setShopDraft] = useState('');
  const [skippedToday, setSkippedToday] = useState<Set<string>>(new Set());
  const [recapData, setRecapData] = useState<{ title: string; slug: string; cuisine: string; servingsCooked: number; durationMinutes: number; cookCount: number; ingredients: Array<{ name: string; quantity: number; unit: string }>; photoDataUrl?: string | null } | null>(null);
  const [shareRecipeId, setShareRecipeId] = useState<string | null>(null);
  const [cookAlongPayload, setCookAlongPayload] = useState<CookAlongPayload | null>(null);
  const [hostCookSession, setHostCookSession] = useState<{ id: string; startedAt: number } | null>(null);
  const localNavigation = useMemo(() => createLocalNavigation<Tab>(tab, setTab), []);
  const peerId = useMemo(() => loadOrCreatePeerId(), []);
  const cookAlongClient = useMemo(
    () => createCookAlongClient({ broadcast: shippie.intent.broadcast, subscribe: shippie.intent.subscribe }, peerId),
    [peerId],
  );
  const { peer: peerCookState, publish: publishCookState } = useCookAlongPeer(cookAlongClient);
  const backupStore = useMemo(() => createPalateBackupStore(), []);
  const intentSource = useMemo<IntentSubscription>(() => ({
    subscribe(callback) {
      const offs = palateMatchers.map((matcher) =>
        shippie.intent.subscribe(matcher.kind, (broadcast) => {
          const intent: IntentLike = {
            kind: broadcast.intent,
            payload: { rows: broadcast.rows },
            sourceAppId: (broadcast as { providerAppId?: string }).providerAppId,
            timestamp: Date.now(),
          };
          callback(intent);
        }),
      );
      return () => offs.forEach((off) => off());
    },
  }), []);

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
  const shareRecipe = shareRecipeId
    ? state.recipes.find((recipe) => recipe.id === shareRecipeId) ?? null
    : null;
  const shareUrl = useMemo(() => {
    if (!shareRecipe) return '';
    const payload = {
      title: shareRecipe.title,
      description: shareRecipe.description,
      cuisine: shareRecipe.cuisine,
      servings: shareRecipe.servings,
      ingredients: shareRecipe.ingredients.map((ing) => ({ name: ing.name, quantity: ing.quantity, unit: ing.unit })),
      steps: shareRecipe.steps,
      dietaryTags: shareRecipe.dietaryTags,
    };
    const encoded = encodeShareFragment(payload);
    const base = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '/';
    return `${base}#recipe=${encoded}`;
  }, [shareRecipe]);

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

  /**
   * Tonight-aware ranking. Layers:
   *   1) Recipes planned for today are pushed to the top (+80)
   *   2) Pantry feasibility boost (0–40, by share of ingredients on hand)
   *   3) Meal-of-the-day fit (+15 if category matches the hour)
   *   4) Tie-break on personalFit
   *
   * Returned with `pantryFraction` so the hero can render "8/10 ready".
   */
  const forYou = useMemo(() => {
    const hour = new Date().getHours();
    const preferred = hour < 11 ? 'Breakfast' : hour < 15 ? 'Lunch' : 'Dinner';
    const plannedToday = new Set(
      state.mealPlan.filter((entry) => entry.date === today()).map((entry) => entry.recipeId),
    );
    const pantryNames = new Set(state.pantry.map((item) => item.name.toLowerCase()));
    return state.recipes
      .filter((recipe) => !skippedToday.has(recipe.id))
      .map((recipe) => {
        const total = recipe.ingredients.length;
        const have = recipe.ingredients.filter((ing) => pantryNames.has(ing.name.toLowerCase())).length;
        const pantryFraction = total > 0 ? have / total : 1;
        const planBoost = plannedToday.has(recipe.id) ? 80 : 0;
        const timeBoost = recipe.category === preferred ? 15 : 0;
        const pantryBoost = Math.round(pantryFraction * 40);
        return {
          recipe,
          score: recipe.personalFit + planBoost + timeBoost + pantryBoost,
          have,
          total,
          pantryFraction,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [state.recipes, state.mealPlan, state.pantry, skippedToday]);

  const forYouRecipes = useMemo(() => forYou.slice(0, 4).map((row) => row.recipe), [forYou]);
  const tonightPick = forYou[0] ?? null;

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
    setTab(next);
    void localNavigation.navigate(next, { kind: 'crossfade', history: 'none' });
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
    event.currentTarget.value = '';
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

  /**
   * Accept a parsed-recipe preview from the import sheet. We pour it
   * into the existing recipe draft (not straight into the cookbook) so
   * the user lands in the normal editor and can fix the heuristics
   * before saving via the unchanged saveRecipe path.
   */
  function applyImportedRecipe(parsed: ParsedRecipe): void {
    setDraft((prev) => ({
      ...prev,
      title: parsed.title === 'Imported recipe' ? '' : parsed.title,
      ingredients: parsed.ingredients.join('\n'),
      steps: parsed.steps.join('\n'),
    }));
    setImportOpen(false);
    shippie.feel.texture('confirm');
    requestAnimationFrame(() => {
      document.getElementById('palate-recipe-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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
          expiresOn: pantryDraft.expiresOn.trim() || undefined,
          updatedAt: Date.now(),
        },
        ...prev.pantry,
      ],
    }));
    setPantryDraft({ name: '', quantity: '1', unit: 'ea', location: 'pantry', expiresOn: '' });
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

  function completeCook(recipe: Recipe, servings: number, durationMinutes?: number): void {
    const cookedAt = Date.now();
    const nextCookCount = recipe.cookCount + 1;
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
            ? { ...candidate, cookCount: nextCookCount, cookedAt, personalFit: Math.min(99, candidate.personalFit + 2) }
            : candidate,
        ),
        cooked: [{ id: id('cook'), recipeId: recipe.id, title: recipe.title, cookedAt, servings }, ...prev.cooked].slice(0, 50),
      };
    });
    shippie.intent.broadcast('cooked-meal', [recipePayload(recipe)]);
    shippie.feel.texture('milestone');
    setCookRecipeId(null);
    setHostCookSession(null);
    setSelectedRecipeId(recipe.id);
    const scale = recipe.servings > 0 ? servings / recipe.servings : 1;
    setRecapData({
      title: recipe.title,
      slug: recipe.id,
      cuisine: recipe.cuisine,
      servingsCooked: servings,
      durationMinutes: durationMinutes ?? recipeTotalTime(recipe),
      cookCount: nextCookCount,
      photoDataUrl: recipe.photoDataUrl ?? null,
      ingredients: recipe.ingredients.map((ing) => ({
        name: ing.name,
        quantity: Number((ing.quantity * scale).toFixed(2)),
        unit: ing.unit,
      })),
    });
  }

  const ensureHostSession = useCallback(() => {
    if (hostCookSession) return hostCookSession;
    const fresh = { id: newCookSessionId(), startedAt: Date.now() };
    setHostCookSession(fresh);
    return fresh;
  }, [hostCookSession]);

  const broadcastCookingNow = useCallback(
    (recipe: Recipe, step: number, servings: number, timerExpiresAt: number | null) => {
      const session = ensureHostSession();
      const payload: CookAlongPayload = {
        recipeId: recipe.id,
        title: recipe.title,
        step,
        totalSteps: Math.max(recipe.steps.length, 1),
        servings,
        timerExpiresAt,
        sessionId: session.id,
        sessionStartedAt: session.startedAt,
        hostPeerId: peerId,
        senderPeerId: peerId,
        updatedAt: Date.now(),
      };
      publishCookState(payload);
    },
    [ensureHostSession, peerId, publishCookState],
  );

  // Open Cook-Along view when ?cookalong=1 is set AND a peer payload is fresh.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const wantsCookAlong = new URL(window.location.href).searchParams.get('cookalong') === '1';
    if (!wantsCookAlong) return;
    if (!peerCookState) return;
    if (Date.now() - peerCookState.sessionStartedAt > COOK_SESSION_TTL_MS) return;
    setCookAlongPayload(peerCookState);
  }, [peerCookState]);

  // Track the peer's state in the cook-along view if it advances.
  useEffect(() => {
    if (!cookAlongPayload || !peerCookState) return;
    if (peerCookState.sessionId !== cookAlongPayload.sessionId) return;
    if (peerCookState.updatedAt <= cookAlongPayload.updatedAt) return;
    setCookAlongPayload(peerCookState);
  }, [peerCookState, cookAlongPayload]);

  const cookAlongAdvance = useCallback(
    (nextStep: number) => {
      if (!cookAlongPayload) return;
      const next: CookAlongPayload = {
        ...cookAlongPayload,
        step: Math.max(0, nextStep),
        senderPeerId: peerId,
        updatedAt: Date.now(),
      };
      setCookAlongPayload(next);
      publishCookState(next);
    },
    [cookAlongPayload, peerId, publishCookState],
  );

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
          <img src={PALATE_LOGO_URL} alt="" />
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
          forYou={forYouRecipes}
          tonightPick={tonightPick}
          shoppingCount={shopping.filter((item) => !item.checked).length}
          onOpenRecipe={setSelectedRecipeId}
          onCook={setCookRecipeId}
          onSkip={(id) => setSkippedToday((prev) => new Set([...prev, id]))}
          onResetSkipped={() => setSkippedToday(new Set())}
          skippedCount={skippedToday.size}
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
          onAddFirstRecipe={() => navigate('cookbook')}
          importOpen={importOpen}
          onOpenImport={() => setImportOpen(true)}
          onCloseImport={() => setImportOpen(false)}
          onApplyImport={applyImportedRecipe}
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
          onNavigate={navigate}
        />
      ) : null}

      {tab === 'data' ? (
        <DataView state={state} onWipe={wipeLocalData} backupStore={backupStore} />
      ) : null}

      {selectedRecipe ? (
        <RecipeSheet
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipeId(null)}
          onCook={() => setCookRecipeId(selectedRecipe.id)}
          onShare={() => setShareRecipeId(selectedRecipe.id)}
        />
      ) : null}

      {cookRecipe ? (
        <CookMode
          recipe={cookRecipe}
          onClose={() => setCookRecipeId(null)}
          onComplete={completeCook}
          onBroadcast={broadcastCookingNow}
        />
      ) : null}

      {recapData ? (
        <CookRecapSheet data={recapData} onClose={() => setRecapData(null)} />
      ) : null}

      {cookAlongPayload ? (
        <CookAlongView
          payload={cookAlongPayload}
          onAdvance={cookAlongAdvance}
          onClose={() => {
            setCookAlongPayload(null);
            if (typeof window !== 'undefined') {
              const url = new URL(window.location.href);
              url.searchParams.delete('cookalong');
              window.history.replaceState(window.history.state, '', url);
            }
          }}
        />
      ) : null}

      <QrShareSheet
        open={Boolean(shareRecipe)}
        url={shareUrl}
        title={shareRecipe ? `Share "${shareRecipe.title}"` : ''}
        body="Local-first: the recipe travels in the URL — no server holds the bytes."
        onClose={() => setShareRecipeId(null)}
      />

      <IntentToastHost matchers={palateMatchers} source={intentSource} position="top" />
    </main>
  );
}

/**
 * Encode a JSON payload as a URL-safe base64 fragment. Keeping the
 * encoding lightweight (no signing, no compression) so it stays cheap
 * to roundtrip in the QR sheet; recipients verify the structure on
 * import. Photos are deliberately excluded upstream to keep the QR
 * scannable per spec §5.7.
 */
function encodeShareFragment(payload: unknown): string {
  const json = JSON.stringify(payload);
  if (typeof btoa === 'undefined') return encodeURIComponent(json);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
  tonightPick,
  shoppingCount,
  onOpenRecipe,
  onCook,
  onSkip,
  onResetSkipped,
  skippedCount,
  onNavigate,
}: {
  state: KitchenState;
  forYou: Recipe[];
  tonightPick: { recipe: Recipe; have: number; total: number; pantryFraction: number } | null;
  shoppingCount: number;
  onOpenRecipe: (recipeId: string) => void;
  onCook: (recipeId: string) => void;
  onSkip: (recipeId: string) => void;
  onResetSkipped: () => void;
  skippedCount: number;
  onNavigate: (tab: Tab) => void;
}) {
  const cookedThisWeek = state.cooked.filter((meal) => Date.now() - meal.cookedAt < 7 * 24 * 60 * 60 * 1000).length;
  const todaysPlan = state.mealPlan.filter((entry) => entry.date === today());
  const pantryLow = state.pantry.filter((item) => item.quantity <= 1);
  const firstPick = tonightPick?.recipe ?? state.recipes[0];
  return (
    <section className="page-shell today-shell">
      <div className="hero-plane">
        <TasteBoard recipes={forYou} pantryLow={pantryLow.length} shoppingCount={shoppingCount} onCook={onCook} />
        <div className="hero-copy">
          <p className="eyebrow">Tonight · {new Date().toLocaleDateString(undefined, { weekday: 'long' })}</p>
          <h1>{firstPick ? firstPick.title : 'Add a recipe to begin'}</h1>
          {tonightPick ? (
            <p className="hero-status">
              <strong>{tonightPick.have}/{tonightPick.total}</strong> ingredients ready ·{' '}
              {todaysPlan.some((p) => p.recipeId === firstPick?.id)
                ? 'matches your plan'
                : tonightPick.pantryFraction >= 0.8
                ? 'kitchen ready'
                : `${shoppingCount > 0 ? `${shoppingCount} on the list` : 'pantry light'}`}
            </p>
          ) : (
            <p className="hero-status">Choose dinner from what you have, then turn the missing pieces into a list.</p>
          )}
          {tonightPick ? (
            <div className="decision-strip" aria-label="Why this dish">
              <span><strong>{recipeTotalTime(tonightPick.recipe)}</strong><small>minutes</small></span>
              <span><strong>{Math.round(tonightPick.pantryFraction * 100)}%</strong><small>pantry ready</small></span>
              <span><strong>{tonightPick.recipe.personalFit}</strong><small>fit score</small></span>
            </div>
          ) : null}
          <div className={`hero-actions ${firstPick ? 'hero-actions-secondary' : ''}`}>
            <button type="button" className="primary" onClick={() => firstPick ? onCook(firstPick.id) : onNavigate('cookbook')} disabled={!firstPick}>
              {firstPick ? 'Cook this' : 'Add recipe'}
            </button>
            {firstPick && forYou.length > 1 ? (
              <button type="button" onClick={() => onSkip(firstPick.id)}>Skip · try another</button>
            ) : null}
            {skippedCount > 0 ? (
              <button type="button" onClick={onResetSkipped}>Reset ({skippedCount} skipped)</button>
            ) : null}
            <button type="button" onClick={() => onNavigate('plan')}>Plan week</button>
          </div>
        </div>
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
          <div className="cook-history">
            <p className="eyebrow">Cook history</p>
            {state.cooked.length === 0 ? (
              <EmptyState
                eyebrow="History"
                headline={<>Cook your first dish and it'll live here.</>}
              />
            ) : (
              <ul className="plain-list cook-history-list">
                {state.cooked.slice(0, 4).map((entry) => (
                  <li key={entry.id}>
                    <span className="cook-code">{new Date(entry.cookedAt).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                    <strong>{entry.title}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
        <img src={PALATE_LOGO_URL} alt="" />
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
  onAddFirstRecipe,
  importOpen,
  onOpenImport,
  onCloseImport,
  onApplyImport,
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
  onAddFirstRecipe: () => void;
  importOpen: boolean;
  onOpenImport: () => void;
  onCloseImport: () => void;
  onApplyImport: (parsed: ParsedRecipe) => void;
}) {
  const showEmpty = recipes.length === 0 && !query.trim();
  const scrollToEditor = () => {
    document.getElementById('palate-recipe-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <section className="page-shell">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Cookbook</p>
          <h1>Your cookbook.</h1>
          <p className="toolbar-subcopy">The recipes you actually cook, saved here instead of scattered through screenshots and tabs.</p>
        </div>
        <button type="button" className="text-action toolbar-action" onClick={onOpenImport}>Import</button>
        <button type="button" className="primary toolbar-action" onClick={scrollToEditor}>Add recipe</button>
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
          {showEmpty ? (
            <EmptyState
              eyebrow="Cookbook"
              headline={<>Save the first dish worth repeating.</>}
              cta={{ label: 'Start a recipe', onClick: onAddFirstRecipe }}
            />
          ) : (
            recipes.map((recipe) => (
              <RecipeRow key={recipe.id} recipe={recipe} onOpen={onOpenRecipe} onCook={onCook} />
            ))
          )}
        </div>
        <form id="palate-recipe-editor" className="recipe-editor recipe-editor-lifted" onSubmit={onSaveRecipe}>
          <div className="recipe-editor-hero">
            {draft.photoDataUrl ? (
              <img src={draft.photoDataUrl} alt="" />
            ) : (
              <div className="recipe-editor-hero-fallback" aria-hidden>
                <span>Take or choose photo</span>
              </div>
            )}
            <label className="file-pill recipe-editor-photo-pill">
              {draft.photoDataUrl ? 'Replace photo' : 'Take or choose photo'}
              <input type="file" accept="image/*" aria-label="Take or choose a recipe photo" onChange={(event) => void onPhotoChange(event)} />
            </label>
          </div>
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
          </div>
          <textarea value={draft.ingredients} onChange={(event) => onDraftChange({ ...draft, ingredients: event.target.value })} placeholder="Ingredients, one per line. Example: 2 tbsp olive oil" rows={5} />
          <textarea value={draft.steps} onChange={(event) => onDraftChange({ ...draft, steps: event.target.value })} placeholder="Steps, one per line" rows={5} />
          <input value={draft.dietaryTags} onChange={(event) => onDraftChange({ ...draft, dietaryTags: event.target.value })} placeholder="Tags: vegetarian, quick, high fibre" />
          {draft.dietaryTags.trim() ? (
            <ul className="dietary-pill-row dietary-pill-row-preview" aria-label="Dietary tag preview">
              {splitLines(draft.dietaryTags).map((tag) => (
                <li key={tag} className="dietary-pill">{tag}</li>
              ))}
            </ul>
          ) : null}
          <textarea value={draft.notes} onChange={(event) => onDraftChange({ ...draft, notes: event.target.value })} placeholder="Private notes" />
          <button type="submit" className="primary">Save recipe</button>
        </form>
      </div>
      {importOpen ? (
        <RecipeImportSheet onClose={onCloseImport} onApply={onApplyImport} />
      ) : null}
    </section>
  );
}

/**
 * Recipe import sheet — paste a blob copied off any website, parse it
 * locally with heuristics, then preview/edit before it flows into the
 * normal recipe editor. No network, no AI: the parsing is all in
 * recipe-import.ts and the user always confirms.
 */
function RecipeImportSheet({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (parsed: ParsedRecipe) => void;
}) {
  const [raw, setRaw] = useState('');
  const [parsed, setParsed] = useState<ParsedRecipe | null>(null);

  function runParse(): void {
    if (!raw.trim()) return;
    setParsed(parseRecipeText(raw));
  }

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <section
        className="recipe-import recipe-sheet-lifted"
        role="dialog"
        aria-label="Import a recipe"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="recipe-picker-head">
          <div>
            <p className="eyebrow">Cookbook · import</p>
            <h2>Paste a recipe</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="recipe-sheet-close">×</button>
        </header>
        {parsed === null ? (
          <>
            <p className="empty">
              Copy a recipe off any website and paste the whole block below. Palate sorts
              the title, ingredients and steps on your device — nothing is sent anywhere.
            </p>
            <textarea
              className="recipe-import-input"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              placeholder={'Paste recipe text here…\n\nTitle\n2 tbsp olive oil\n1 onion, diced\n\nMethod\n1. Soften the onion…'}
              rows={9}
              autoFocus
            />
            <div className="recipe-import-actions">
              <button type="button" onClick={onClose} className="text-action">Cancel</button>
              <button type="button" className="primary" onClick={runParse} disabled={!raw.trim()}>
                Parse recipe
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="empty">Check the parse below — you can fix anything in the editor after.</p>
            <div className="recipe-import-preview">
              <div className="recipe-import-field">
                <span className="eyebrow">Title</span>
                <strong>{parsed.title}</strong>
              </div>
              <div className="recipe-import-field">
                <span className="eyebrow">Ingredients · {parsed.ingredients.length}</span>
                {parsed.ingredients.length > 0 ? (
                  <ul className="recipe-import-list">
                    {parsed.ingredients.map((line, index) => (
                      <li key={`ing-${index}`}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty">None detected — add them by hand in the editor.</p>
                )}
              </div>
              <div className="recipe-import-field">
                <span className="eyebrow">Steps · {parsed.steps.length}</span>
                {parsed.steps.length > 0 ? (
                  <ol className="recipe-import-list">
                    {parsed.steps.map((line, index) => (
                      <li key={`step-${index}`}>{line}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="empty">None detected — add them by hand in the editor.</p>
                )}
              </div>
            </div>
            <div className="recipe-import-actions">
              <button type="button" onClick={() => setParsed(null)} className="text-action">Re-paste</button>
              <button type="button" className="primary" onClick={() => onApply(parsed)}>
                Use this recipe
              </button>
            </div>
          </>
        )}
      </section>
    </div>
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
  const todaysSet = mealPlan.filter((entry) => entry.date === today()).length;
  const isEmpty = mealPlan.length === 0;
  const [picker, setPicker] = useState<{ date: string; meal: MealType } | null>(null);
  const pickerCurrent = picker
    ? mealPlan.find((e) => e.date === picker.date && e.mealType === picker.meal)?.recipeId ?? null
    : null;
  return (
    <section className="page-shell">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Plan · this week</p>
          <h1>This week.</h1>
          <p className="plan-summary">Today's plan: <strong>{todaysSet}/4 set</strong></p>
        </div>
        <button type="button" className="primary" onClick={onAutoPlan}>Fill week</button>
      </div>
      {isEmpty ? (
        <EmptyState
          eyebrow="Plan"
          headline={<>Tap an empty meal slot to drop a recipe in.</>}
          cta={{ label: 'Fill the week', onClick: onAutoPlan }}
        />
      ) : null}
      <div className="plan-board plan-calendar">
        {dates.map((date) => {
          const dayDate = new Date(`${date}T12:00:00`);
          const weekday = dayDate.toLocaleDateString(undefined, { weekday: 'long' });
          const dayNumber = dayDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          const isToday = date === today();
          return (
            <section key={date} className={`plan-day plan-day-card${isToday ? ' is-today' : ''}`}>
              <header className="plan-day-header">
                <strong>{weekday}</strong>
                <span className="cook-code">{dayNumber}</span>
              </header>
              <div className="meal-grid">
                {MEALS.map((meal) => {
                  const entry = mealPlan.find((candidate) => candidate.date === date && candidate.mealType === meal);
                  const recipe = entry ? recipes.find((r) => r.id === entry.recipeId) : null;
                  return (
                    <button
                      key={meal}
                      type="button"
                      className={`plan-slot meal-cell ${MEAL_TONE[meal]}${recipe ? ' is-filled' : ''}`}
                      onClick={() => setPicker({ date, meal })}
                      aria-label={recipe ? `${meal}: ${recipe.title} — tap to change` : `${meal}: empty — tap to assign a recipe`}
                    >
                      <span className="meal-tag">{meal}</span>
                      {recipe ? (
                        <span className="meal-title">{recipe.title}</span>
                      ) : (
                        <span className="meal-empty">Tap to assign</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {picker ? (
        <RecipePickerSheet
          recipes={recipes}
          mealLabel={picker.meal}
          dayLabel={formatDay(picker.date)}
          currentRecipeId={pickerCurrent}
          onPick={(recipeId) => {
            onPlan(picker.date, picker.meal, recipeId);
            setPicker(null);
          }}
          onClear={() => {
            onPlan(picker.date, picker.meal, '');
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </section>
  );
}

/**
 * Mobile recipe picker — replaces the old <select>. Tapping an empty slot
 * opens this bottom-sheet list; tapping a filled slot also offers "Clear".
 * Searchable so a long cookbook stays usable on a phone.
 */
function RecipePickerSheet({
  recipes,
  mealLabel,
  dayLabel,
  currentRecipeId,
  onPick,
  onClear,
  onClose,
}: {
  recipes: Recipe[];
  mealLabel: MealType;
  dayLabel: string;
  currentRecipeId: string | null;
  onPick: (recipeId: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q
    ? recipes.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.cuisine.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q),
      )
    : recipes;
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <section
        className="recipe-picker recipe-sheet-lifted"
        role="dialog"
        aria-label={`Pick a recipe for ${mealLabel}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="recipe-picker-head">
          <div>
            <p className="eyebrow">{dayLabel} · {mealLabel}</p>
            <h2>Pick a recipe</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="recipe-sheet-close">×</button>
        </header>
        <label className="search-box recipe-picker-search">
          <span>Search the cookbook</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="title, cuisine, category"
            autoFocus
          />
        </label>
        <div className="recipe-picker-list">
          {shown.length === 0 ? (
            <p className="empty">No recipes match "{query}".</p>
          ) : (
            shown.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                className={`recipe-picker-item${recipe.id === currentRecipeId ? ' is-current' : ''}`}
                onClick={() => onPick(recipe.id)}
              >
                <span className="recipe-picker-mark" aria-hidden>
                  {recipe.photoDataUrl ? (
                    <img src={recipe.photoDataUrl} alt="" />
                  ) : (
                    recipe.title.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="recipe-picker-text">
                  <strong>{recipe.title}</strong>
                  <small>{recipe.cuisine} · {recipe.category} · {recipeTotalTime(recipe)} min</small>
                </span>
                {recipe.id === currentRecipeId ? <span className="recipe-picker-tick">✓</span> : null}
              </button>
            ))
          )}
        </div>
        {currentRecipeId ? (
          <button type="button" className="recipe-picker-clear" onClick={onClear}>
            Clear this slot
          </button>
        ) : null}
      </section>
    </div>
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
  draft: PantryDraft;
  onDraftChange: (draft: PantryDraft) => void;
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  onAdjust: (itemId: string, delta: number) => void;
}) {
  return (
    <section className="page-shell">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Pantry</p>
          <h1>What’s in the kitchen.</h1>
          <p className="toolbar-subcopy">Stock, low items, and the gaps your plan already knows about.</p>
        </div>
        <form className="inline-form" onSubmit={onAdd}>
          <input value={draft.name} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} placeholder="Item" required />
          <input value={draft.quantity} onChange={(event) => onDraftChange({ ...draft, quantity: event.target.value })} inputMode="decimal" />
          <input value={draft.unit} onChange={(event) => onDraftChange({ ...draft, unit: event.target.value })} />
          <select value={draft.location} onChange={(event) => onDraftChange({ ...draft, location: event.target.value as PantryLocation })}>
            {LOCATIONS.map((loc) => <option key={loc}>{loc}</option>)}
          </select>
          <input
            type="date"
            value={draft.expiresOn}
            onChange={(event) => onDraftChange({ ...draft, expiresOn: event.target.value })}
            aria-label="Expiry date (optional)"
            title="Expiry date (optional)"
          />
          <button type="submit" className="primary">Add</button>
        </form>
      </div>
      {pantry.length === 0 ? (
        <EmptyState
          eyebrow="Pantry"
          headline={<>Pop in the four staples that always run out.</>}
        />
      ) : (
        <div className="inventory-table pantry-table">
          {pantry.map((item) => {
            const badge = PANTRY_LOCATION_BADGES[item.location];
            const expiry = describeExpiry(item.expiresOn);
            const low = item.quantity <= 1;
            return (
              <div className={`inventory-row pantry-row${low ? ' is-low' : ''}`} key={item.id}>
                <strong className="pantry-name">{item.name}</strong>
                <span className="pantry-qty">
                  <span className="qty">{item.quantity}</span> {item.unit}
                </span>
                <span className={`pantry-location-badge pantry-location-${item.location}`}>
                  <span aria-hidden>{badge.icon}</span>
                  <small>{badge.label}</small>
                </span>
                {expiry ? (
                  <span className={`pantry-expiry-chip${expiry.urgent ? ' is-urgent' : ''}`}>{expiry.label}</span>
                ) : null}
                <div className="pantry-actions">
                  <button type="button" aria-label={`Decrease ${item.name}`} onClick={() => onAdjust(item.id, -1)}>-</button>
                  <button type="button" aria-label={`Increase ${item.name}`} onClick={() => onAdjust(item.id, 1)}>+</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function describeExpiry(expiresOn?: string): { label: string; urgent: boolean } | null {
  if (!expiresOn) return null;
  const target = new Date(`${expiresOn}T12:00:00`).getTime();
  if (!Number.isFinite(target)) return null;
  const days = Math.round((target - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return { label: `expired ${Math.abs(days)}d ago`, urgent: true };
  if (days === 0) return { label: 'use today', urgent: true };
  if (days === 1) return { label: '1 day left', urgent: true };
  return { label: `${days} days left`, urgent: days <= 3 };
}

function ShoppingView({
  shopping,
  draft,
  onDraftChange,
  onAdd,
  onToggle,
  onNavigate,
}: {
  shopping: ShoppingItem[];
  draft: string;
  onDraftChange: (value: string) => void;
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  onToggle: (item: ShoppingItem) => void;
  onNavigate: (tab: Tab) => void;
}) {
  const grouped = useMemo(() => groupByAisle(shopping), [shopping]);
  return (
    <section className="page-shell">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Shop</p>
          <h1>Shopping list.</h1>
          <p className="toolbar-subcopy">Only the missing pieces. Checked items disappear from the noise.</p>
        </div>
        <form className="inline-form compact" onSubmit={onAdd}>
          <input value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder="Add item" />
          <button type="submit" className="primary">Add</button>
        </form>
      </div>
      {shopping.length === 0 ? (
        <EmptyState
          eyebrow="Shop"
          headline={<>What does this week need?</>}
          cta={{ label: 'Plan this week', onClick: () => onNavigate('plan') }}
        />
      ) : (
        <div className="shopping-list shop-grouped">
          {grouped.map((group) => (
            <section key={group.key} className="shop-aisle">
              <header className="shop-aisle-header">
                <p className="eyebrow">{group.label}</p>
                <span className="cook-code">{group.items.length}</span>
              </header>
              {group.items.map((item) => {
                const badge = SOURCE_BADGE[item.source];
                return (
                  <button key={item.id} type="button" className={item.checked ? 'checked' : ''} onClick={() => onToggle(item)}>
                    <span>{item.checked ? '✓' : ''}</span>
                    <strong>{item.name}</strong>
                    <small className={`shop-source-badge ${badge.tone}`}>{badge.label}</small>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function groupByAisle(items: ShoppingItem[]): Array<{ key: string; label: string; items: ShoppingItem[] }> {
  const buckets = new Map<string, { label: string; items: ShoppingItem[] }>();
  const other = { label: 'Other', items: [] as ShoppingItem[] };
  for (const item of items) {
    const aisle = SHOP_AISLES.find((candidate) => candidate.matchers.test(item.name));
    if (aisle) {
      const bucket = buckets.get(aisle.key) ?? { label: aisle.label, items: [] };
      bucket.items.push(item);
      buckets.set(aisle.key, bucket);
    } else {
      other.items.push(item);
    }
  }
  const out = [...buckets.entries()].map(([key, value]) => ({ key, label: value.label, items: value.items }));
  if (other.items.length > 0) out.push({ key: 'other', label: 'Other', items: other.items });
  return out;
}

function DataView({
  state,
  onWipe,
  backupStore,
}: {
  state: KitchenState;
  onWipe: () => void;
  backupStore: ReturnType<typeof createPalateBackupStore>;
}) {
  return (
    <section className="page-shell data-page">
      <p className="eyebrow">Local data</p>
      <h1>Your kitchen data.</h1>
      <p className="measure">
        Recipes, pantry, meal plan, shopping, and photos are stored in this browser on this device.
        Shippie hosts the app package; your kitchen data does not live in a Shippie database.
      </p>
      <section className="metric-strip">
        <div><strong>{state.recipes.length}</strong><span>recipes</span></div>
        <div><strong>{state.pantry.length}</strong><span>pantry rows</span></div>
        <div><strong>{state.cooked.length}</strong><span>cooks logged</span></div>
      </section>
      <BackupCard appSlug="palate" store={backupStore} />
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

function RecipeSheet({ recipe, onClose, onCook, onShare }: { recipe: Recipe; onClose: () => void; onCook: () => void; onShare: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <section className="recipe-sheet recipe-sheet-lifted" role="dialog" aria-label={recipe.title} onClick={(event) => event.stopPropagation()}>
        <div className="recipe-sheet-hero">
          {recipe.photoDataUrl ? (
            <img src={recipe.photoDataUrl} alt="" />
          ) : (
            <div className="recipe-sheet-hero-fallback" aria-hidden>
              <span>{recipe.title.slice(0, 1)}</span>
            </div>
          )}
          <span className="cuisine-programme-badge">{recipe.cuisine.toUpperCase()}</span>
          <button type="button" onClick={onClose} aria-label="Close" className="recipe-sheet-close">×</button>
        </div>
        <header className="recipe-sheet-meta">
          <p className="eyebrow">{recipe.category} · {recipeTotalTime(recipe)} min · serves {recipe.servings}</p>
          <h1 className="recipe-title">{recipe.title}</h1>
          <p>{recipe.description}</p>
          {recipe.dietaryTags.length > 0 ? (
            <ul className="dietary-pill-row" aria-label="Dietary tags">
              {recipe.dietaryTags.map((tag) => (
                <li key={tag} className="dietary-pill">{tag}</li>
              ))}
            </ul>
          ) : null}
        </header>
        <div className="sheet-grid">
          <section>
            <h2>Ingredients</h2>
            <ul className="ingredient-tile-list">
              {recipe.ingredients.map((ing) => (
                <li key={ing.id} className="ingredient-tile">
                  <span className="qty">{ing.quantity}</span>
                  <small>{ing.unit}</small>
                  <strong>{ing.name}</strong>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2>Method</h2>
            <ol className="method-step-list">
              {recipe.steps.map((step, index) => (
                <li key={`${step}-${index}`} className="method-step">
                  <span className="step-number">{index + 1}</span>
                  <p>{step}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
        {recipe.notes ? <p className="note">{recipe.notes}</p> : null}
        <div className="recipe-sheet-actions">
          <button type="button" className="primary" onClick={onCook}>Start cooking</button>
          <button type="button" onClick={onShare}>Share via QR</button>
        </div>
      </section>
    </div>
  );
}

function CookMode({
  recipe,
  onClose,
  onComplete,
  onBroadcast,
}: {
  recipe: Recipe;
  onClose: () => void;
  onComplete: (recipe: Recipe, servings: number, durationMinutes?: number) => void;
  onBroadcast: (recipe: Recipe, step: number, servings: number, timerExpiresAt: number | null) => void;
}) {
  const [step, setStep] = useState(0);
  const [servings, setServings] = useState(recipe.servings);
  const [startedAt] = useState(() => Date.now());
  const [timerExpiresAt, setTimerExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const current = recipe.steps[step] ?? 'Plate, taste, and make it yours.';

  const scale = recipe.servings > 0 ? servings / recipe.servings : 1;
  const scaledIngredients = useMemo(
    () => recipe.ingredients.map((ing) => ({
      id: ing.id,
      name: ing.name,
      unit: ing.unit,
      quantity: formatQuantity(ing.quantity * scale),
    })),
    [recipe.ingredients, scale],
  );

  // Broadcast cooking-now intent on each step transition (and on mount).
  useEffect(() => {
    onBroadcast(recipe, step, servings, timerExpiresAt);
  }, [recipe, step, servings, timerExpiresAt, onBroadcast]);

  // Tick once a second while a timer is live so the countdown re-renders.
  useEffect(() => {
    if (timerExpiresAt === null) return;
    setNow(Date.now());
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [timerExpiresAt]);

  const startTimer = (minutes: number) => {
    setTimerExpiresAt(Date.now() + minutes * 60 * 1000);
  };

  const remainingMs = timerExpiresAt !== null ? timerExpiresAt - now : 0;
  const timerDone = timerExpiresAt !== null && remainingMs <= 0;
  const countdownLabel = (() => {
    const total = Math.max(0, Math.ceil(remainingMs / 1000));
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  })();

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
        {timerExpiresAt !== null ? (
          <div className={`cook-timer-display${timerDone ? ' is-done' : ''}`} role="timer" aria-live="polite">
            <span className="cook-timer-time">{timerDone ? 'Timer done' : countdownLabel}</span>
            <small>{timerDone ? 'Check the pan' : 'time remaining'}</small>
          </div>
        ) : null}
        <div className="cook-timer-controls">
          <button type="button" className="cook-timer-btn" onClick={() => startTimer(5)}>5 min</button>
          <button type="button" className="cook-timer-btn" onClick={() => startTimer(10)}>10 min</button>
          <button type="button" className="cook-timer-btn" onClick={() => startTimer(20)}>20 min</button>
          {timerExpiresAt !== null ? (
            <button type="button" className="cook-timer-btn" onClick={() => setTimerExpiresAt(null)}>
              {timerDone ? 'Clear' : 'Stop timer'}
            </button>
          ) : null}
        </div>
      </section>
      <section className="cook-ingredients" aria-label={`Ingredients for ${servings} serving${servings === 1 ? '' : 's'}`}>
        <p className="cook-ingredients-head">
          For <strong>{servings}</strong> serving{servings === 1 ? '' : 's'}
          {servings !== recipe.servings ? <small> · recipe makes {recipe.servings}</small> : null}
        </p>
        <ul className="cook-ingredient-list">
          {scaledIngredients.map((ing) => (
            <li key={ing.id}>
              <span className="cook-ingredient-qty">{ing.quantity} {ing.unit}</span>
              <span className="cook-ingredient-name">{ing.name}</span>
            </li>
          ))}
        </ul>
      </section>
      <footer>
        <button type="button" disabled={step === 0} onClick={() => setStep((prev) => Math.max(0, prev - 1))}>Back</button>
        {step < recipe.steps.length - 1 ? (
          <button type="button" className="primary" onClick={() => setStep((prev) => prev + 1)}>Next</button>
        ) : (
          <button type="button" className="primary" onClick={() => onComplete(recipe, servings, Math.max(1, Math.round((Date.now() - startedAt) / 60_000)))}>
            Mark cooked
          </button>
        )}
      </footer>
    </div>
  );
}
