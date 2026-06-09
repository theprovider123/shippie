// lot. local-first persistence.
//
// Everything lives in one localStorage blob (rows are tiny and there are a
// handful per day). The store is intentionally flat — Bag, Recipe, BrewLog,
// CupScore, Grinder, plus a SyncQueue of pending publishes. Nothing here
// touches the network; publishing happens explicitly via lib/sync.
//
// v3 (lot.) supersedes the old "Coffee Calculator" v2 (beans + brews). The
// migration is lossy-tolerant: a v2 bean becomes a lot. Bag, a v2 brew
// becomes a BrewLog, and anything missing falls back to a sensible default.

import type {
  Bag,
  BrewLog,
  CupScore,
  Grinder,
  Recipe,
  RoastLevel,
  SyncItem,
} from './types.ts';

const STORAGE_KEY = 'shippie.coffee.v3';
const LEGACY_V2 = 'shippie.coffee.v2';

export interface Store {
  bags: Bag[];
  recipes: Recipe[];
  brewLogs: BrewLog[];
  cupScores: CupScore[];
  grinders: Grinder[];
  syncQueue: SyncItem[];
}

// ─── id + date helpers ────────────────────────────────────────
export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─── Seed ─────────────────────────────────────────────────────
// Mirrors the Claude Design handoff data so a fresh install opens onto the
// exact screens in the mock, but as real, editable, persisted records.
function seed(): Store {
  const now = isoNow();
  const mk = (
    id: string,
    name: string,
    roasterName: string,
    roasterSlug: string,
    originCountry: string,
    originRegion: string,
    process: string,
    variety: string,
    roastLevel: RoastLevel,
    daysOff: number,
    gramsRemaining: number,
    worldNodeSlug: string,
    status: Bag['status'] = 'active',
  ): Bag => ({
    id,
    name,
    roasterName,
    roasterSlug,
    originCountry,
    originRegion,
    process,
    variety,
    roastLevel,
    roastDate: daysAgoIso(daysOff),
    openedDate: daysAgoIso(Math.max(0, daysOff - 2)),
    purchaseDate: daysAgoIso(daysOff),
    gramsRemaining,
    gramsOriginal: 250,
    status,
    worldNodeSlug,
    createdAt: now,
    updatedAt: now,
  });

  const kochere = mk('seed-kochere', 'Kochere Lot 42', 'Square Mile', 'square-mile', 'Ethiopia', 'Yirgacheffe', 'Natural', 'Heirloom', 'medium', 12, 142, 'yirgacheffe');
  const finca = mk('seed-finca', 'Finca El Paraíso', 'Onyx Coffee Lab', 'onyx', 'Colombia', 'Huila', 'Anaerobic Natural', 'Castillo', 'light', 3, 250, 'huila');
  const gesha = mk('seed-gesha', 'Gesha Village Lot 22', 'Heart Coffee', 'heart', 'Ethiopia', 'Bench Maji', 'Washed', 'Gesha', 'medium', 24, 38, 'bench-maji');

  const guji: Bag = { ...mk('seed-guji', 'Guji Natural Gr.1', 'Has Bean', 'has-bean', 'Ethiopia', 'Guji', 'Natural', 'Heirloom', 'medium', 90, 0, 'guji', 'finished') };
  const lapalma: Bag = { ...mk('seed-lapalma', 'La Palma y El Tucán', 'Nomad Coffee', 'nomad', 'Colombia', 'Cundinamarca', 'Washed', 'Castillo', 'light', 120, 0, 'cundinamarca', 'finished') };

  const espressoRecipe: Recipe = {
    id: 'seed-recipe-kochere',
    bagId: kochere.id,
    method: 'espresso',
    dose: 18,
    yield: 36,
    ratio: '1:2',
    grindSetting: '15.5',
    waterTemp: 93,
    totalTime: 28,
    steps: [
      { label: 'Pre-infuse', targetTime: 5, targetVolume: 4, notes: 'gentle ramp' },
      { label: 'Bloom', targetTime: 10, targetVolume: 12, notes: 'first drops' },
      { label: 'Extract', targetTime: 28, targetVolume: 36, notes: 'hold the flow' },
    ],
    isActive: true,
    isDialled: true,
    createdAt: now,
    updatedAt: now,
  };

  // A spread of cup scores so the palate radar lands near the design profile
  // (Brightness 3.8 · Body 3.2 · Sweetness 4.1 · Complexity 3.6 · Clean 4.3,
  // on the 0–5 radar = ~7.6/6.4/8.2/7.2/8.6 on the stored 1–10 axes).
  const cupSeeds: Array<[string, number, number, number, number, number, number, string[]]> = [
    [kochere.id, 14, 8, 6, 8, 7, 9, ['floral', 'citric', 'tea-like']],
    [kochere.id, 8, 7, 7, 8, 7, 8, ['stone fruit', 'jasmine']],
    [finca.id, 5, 8, 6, 9, 8, 9, ['tropical', 'winey', 'complex']],
    [gesha.id, 20, 7, 6, 8, 7, 9, ['bergamot', 'honey']],
    [guji.id, 60, 8, 7, 8, 7, 8, ['blueberry', 'cocoa']],
    [lapalma.id, 80, 7, 6, 8, 7, 9, ['red apple', 'caramel']],
  ];
  const cupScores: CupScore[] = cupSeeds.map(([bagId, daysOff, b, body, sw, cx, cl, notes], i) => ({
    id: `seed-cup-${i}`,
    bagId,
    brightness: b,
    body,
    sweetness: sw,
    complexity: cx,
    clean: cl,
    tasteNotes: notes,
    published: i % 2 === 0,
    publishedAt: i % 2 === 0 ? daysAgoIso(daysOff) : undefined,
    createdAt: daysAgoIso(daysOff),
  }));

  // Brew history feeding the "N brews" counter.
  const brewLogs: BrewLog[] = cupSeeds.map(([bagId, daysOff], i) => ({
    id: `seed-brew-${i}`,
    bagId,
    recipeId: bagId === kochere.id ? espressoRecipe.id : undefined,
    actualDose: 18,
    actualYield: 36,
    actualTime: 28 + (i % 3),
    stepTimings: [],
    published: false,
    createdAt: daysAgoIso(daysOff),
  }));

  return {
    bags: [kochere, finca, gesha, guji, lapalma],
    recipes: [espressoRecipe],
    brewLogs,
    cupScores,
    grinders: [{ id: 'seed-grinder', name: 'Niche Zero', type: 'burr', createdAt: now }],
    syncQueue: [],
  };
}

// ─── Load / save ──────────────────────────────────────────────
function coerce(parsed: Partial<Store> | null): Store {
  if (!parsed) return seed();
  const hasBags = Array.isArray(parsed.bags) && parsed.bags.length > 0;
  if (!hasBags) return seed();
  return {
    bags: parsed.bags ?? [],
    recipes: Array.isArray(parsed.recipes) ? parsed.recipes : [],
    brewLogs: Array.isArray(parsed.brewLogs) ? parsed.brewLogs : [],
    cupScores: Array.isArray(parsed.cupScores) ? parsed.cupScores : [],
    grinders: Array.isArray(parsed.grinders) ? parsed.grinders : [],
    syncQueue: Array.isArray(parsed.syncQueue) ? parsed.syncQueue : [],
  };
}

interface LegacyV2Bean {
  id: string;
  name: string;
  roaster?: string;
  origin?: string;
  process?: string;
  roast?: RoastLevel;
  roast_date?: string;
  grind?: string;
  method?: string;
  ratio?: number;
  notes?: string;
}
interface LegacyV2 {
  beans?: LegacyV2Bean[];
}

function migrateV2(raw: string): Store | null {
  try {
    const v2 = JSON.parse(raw) as LegacyV2;
    if (!Array.isArray(v2.beans) || v2.beans.length === 0) return null;
    const now = isoNow();
    const bags: Bag[] = v2.beans.map((b) => ({
      id: b.id || newId('bag'),
      name: b.name,
      roasterName: b.roaster ?? 'Unknown roaster',
      originCountry: b.origin,
      process: b.process,
      roastLevel: b.roast ?? 'medium',
      roastDate: b.roast_date,
      gramsRemaining: 250,
      gramsOriginal: 250,
      status: 'active',
      notes: b.notes,
      createdAt: now,
      updatedAt: now,
    }));
    const base = seed();
    return { ...base, bags: [...bags, ...base.bags.filter((s) => s.status === 'finished')] };
  } catch {
    return null;
  }
}

export function load(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return coerce(JSON.parse(raw) as Partial<Store>);
    const legacy = localStorage.getItem(LEGACY_V2);
    if (legacy) {
      const migrated = migrateV2(legacy);
      if (migrated) return migrated;
    }
  } catch {
    /* fall through to seed */
  }
  return seed();
}

export function save(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* best-effort; quota errors are non-fatal */
  }
}

// ─── Selectors (no query logic in components) ─────────────────
export const bagsByStatus = (s: Store, status: Bag['status']): Bag[] =>
  s.bags.filter((b) => b.status === status);

export const activeRecipeForBag = (s: Store, bagId: string): Recipe | undefined =>
  s.recipes.find((r) => r.bagId === bagId && r.isActive) ??
  s.recipes.find((r) => r.bagId === bagId);

export const brewsForBag = (s: Store, bagId: string): BrewLog[] =>
  s.brewLogs.filter((b) => b.bagId === bagId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const scoresForBag = (s: Store, bagId: string): CupScore[] =>
  s.cupScores.filter((c) => c.bagId === bagId);

export const distinctOrigins = (s: Store): number =>
  new Set(s.bags.map((b) => b.originCountry).filter(Boolean)).size;
