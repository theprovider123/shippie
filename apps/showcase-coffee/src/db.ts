/**
 * Coffee Calculator persistence — beans + brews. localStorage-backed
 * for v1 (rows are tiny + handful per day). The Shippie runtime
 * watches storage writes via the patina/proof spine; each finished
 * brew also broadcasts coffee-brewed + caffeine-logged.
 */
const STORAGE_KEY = 'shippie.coffee.v1';

export type RoastLevel = 'light' | 'medium' | 'dark';
export type BrewMethod = 'v60' | 'aeropress' | 'chemex' | 'french-press' | 'espresso';

export interface Bean {
  id: string;
  name: string;
  roaster?: string;
  roast: RoastLevel;
  /** Free-text grind setting — "Comandante 18 clicks", "Niche 12", etc. */
  grind: string;
  method: BrewMethod;
  /** 1:N water-to-bean ratio. Typical V60 = 16, espresso = 2. */
  ratio: number;
  notes?: string;
}

export interface Brew {
  id: string;
  bean_id: string | null;
  bean_name: string;
  weight_g: number;
  water_g: number;
  ratio: number;
  method: BrewMethod;
  brew_seconds: number;
  taste_rating: number | null;
  brewed_at: string;
}

interface Persisted {
  beans: Bean[];
  brews: Brew[];
}

export const METHOD_LABEL: Record<BrewMethod, string> = {
  v60: 'V60',
  aeropress: 'AeroPress',
  chemex: 'Chemex',
  'french-press': 'French Press',
  espresso: 'Espresso',
};

/** Caffeine mg estimate per gram of beans by method. Rough but useful
 * for the caffeine-logged broadcast. */
export const MG_PER_GRAM: Record<BrewMethod, number> = {
  v60: 4.5,
  aeropress: 5.0,
  chemex: 4.0,
  'french-press': 4.5,
  espresso: 8.0,
};

/** Method defaults (ratio + recommended brew time in seconds). */
export const METHOD_DEFAULTS: Record<BrewMethod, { ratio: number; seconds: number }> = {
  v60: { ratio: 16, seconds: 180 },
  aeropress: { ratio: 14, seconds: 90 },
  chemex: { ratio: 17, seconds: 240 },
  'french-press': { ratio: 15, seconds: 240 },
  espresso: { ratio: 2, seconds: 28 },
};

const SEED_BEANS: Bean[] = [
  {
    id: 'seed-1',
    name: 'Workshop Cult of Done',
    roaster: 'Workshop Coffee',
    roast: 'medium',
    grind: 'Comandante 22',
    method: 'v60',
    ratio: 16,
    notes: 'Plum, cocoa, soft acidity.',
  },
  {
    id: 'seed-2',
    name: 'Square Mile Red Brick',
    roaster: 'Square Mile',
    roast: 'medium',
    grind: 'Niche 14',
    method: 'espresso',
    ratio: 2,
    notes: 'Dark chocolate, raisin.',
  },
];

export function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { beans: SEED_BEANS, brews: [] };
    const parsed = JSON.parse(raw) as Persisted;
    return {
      beans: Array.isArray(parsed.beans) && parsed.beans.length > 0 ? parsed.beans : SEED_BEANS,
      brews: Array.isArray(parsed.brews) ? parsed.brews : [],
    };
  } catch {
    return { beans: SEED_BEANS, brews: [] };
  }
}

export function save(state: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* best-effort */
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Round to one decimal — water/bean grams display as "18.0g". */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
