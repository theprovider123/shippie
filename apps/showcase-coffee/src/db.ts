/**
 * Coffee persistence — beans + brews + tasting notes. localStorage-backed
 * (rows are tiny + a handful per day). The Shippie runtime watches storage
 * writes via the patina/proof spine; each finished brew also broadcasts
 * coffee-brewed + caffeine-logged.
 *
 * Schema is intentionally flat: one `Bean`, many `Brew` (joined by bean_id),
 * many `TastingNote` (joined by bean_id). Migration from v1 (which only had
 * Beans + Brews and lacked roast_date / origin / process / cupping_score) is
 * lossy-tolerant: missing fields fall back to sensible defaults.
 */
const STORAGE_KEY = 'shippie.coffee.v2';
const LEGACY_KEY = 'shippie.coffee.v1';

export type RoastLevel = 'light' | 'medium' | 'dark';
export type BrewMethod = 'v60' | 'aeropress' | 'chemex' | 'french-press' | 'espresso';
export type Process = 'washed' | 'natural' | 'honey' | 'other';
export type TastingKind = 'sweet' | 'acidity' | 'body' | 'aftertaste' | 'general';

export interface Bean {
  id: string;
  name: string;
  roaster?: string;
  /** Country, ideally with region/farm. e.g. "Ethiopia · Yirgacheffe / Konga". */
  origin?: string;
  process?: Process;
  roast: RoastLevel;
  /** ISO date (YYYY-MM-DD). Load-bearing for the freshness chart. */
  roast_date?: string;
  /** SCA cupping score 1–100. Optional — coffee-nerd domain. */
  cupping_score?: number;
  /** Free-text grind setting — "Comandante 18 clicks", "Niche 12", etc. */
  grind: string;
  method: BrewMethod;
  /** 1:N water-to-bean ratio. Typical V60 = 16, espresso = 2. */
  ratio: number;
  /** Comma-tolerant free-text tasting impression. Chips suggested in UI. */
  notes?: string;
  /** Optional photo URL. Inline data: URLs are accepted but discouraged. */
  photo_url?: string;
  created_at?: string;
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
  /** Short journal — "best yet, more bloom next time". */
  note?: string;
  brewed_at: string;
}

export interface TastingNote {
  id: string;
  bean_id: string;
  kind: TastingKind;
  note: string;
  created_at: string;
}

interface Persisted {
  beans: Bean[];
  brews: Brew[];
  tasting_notes: TastingNote[];
}

export const METHOD_LABEL: Record<BrewMethod, string> = {
  v60: 'V60',
  aeropress: 'AeroPress',
  chemex: 'Chemex',
  'french-press': 'French Press',
  espresso: 'Espresso',
};

export const PROCESS_LABEL: Record<Process, string> = {
  washed: 'Washed',
  natural: 'Natural',
  honey: 'Honey',
  other: 'Other',
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

/** Method defaults: ratio + recommended brew time + suggested grind. */
export const METHOD_DEFAULTS: Record<
  BrewMethod,
  { ratio: number; seconds: number; grindHint: string; weightHint: number }
> = {
  v60: { ratio: 16, seconds: 180, grindHint: 'medium-fine', weightHint: 15 },
  aeropress: { ratio: 14, seconds: 90, grindHint: 'medium', weightHint: 14 },
  chemex: { ratio: 17, seconds: 240, grindHint: 'medium-coarse', weightHint: 30 },
  'french-press': { ratio: 15, seconds: 240, grindHint: 'coarse', weightHint: 30 },
  espresso: { ratio: 2, seconds: 28, grindHint: 'fine', weightHint: 18 },
};

/** Filter brews vs espresso scope different ratio ranges on the dial. */
export const RATIO_RANGE: Record<'filter' | 'espresso', { min: number; max: number; step: number }> = {
  filter: { min: 12, max: 20, step: 0.5 },
  espresso: { min: 1, max: 3, step: 0.1 },
};

export function modeForMethod(m: BrewMethod): 'filter' | 'espresso' {
  return m === 'espresso' ? 'espresso' : 'filter';
}

const TODAY = (): string => new Date().toISOString().slice(0, 10);
const DAYS_AGO = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const SEED_BEANS: Bean[] = [
  {
    id: 'seed-1',
    name: 'Cult of Done',
    roaster: 'Workshop Coffee',
    origin: 'Ethiopia · Yirgacheffe / Konga',
    process: 'washed',
    roast: 'medium',
    roast_date: DAYS_AGO(10),
    cupping_score: 87,
    grind: 'Comandante 22',
    method: 'v60',
    ratio: 16,
    notes: 'plum, cocoa, soft acidity',
    created_at: new Date().toISOString(),
  },
  {
    id: 'seed-2',
    name: 'Red Brick',
    roaster: 'Square Mile',
    origin: 'Brazil + Honduras blend',
    process: 'natural',
    roast: 'medium',
    roast_date: DAYS_AGO(18),
    cupping_score: 84,
    grind: 'Niche 14',
    method: 'espresso',
    ratio: 2,
    notes: 'dark chocolate, raisin',
    created_at: new Date().toISOString(),
  },
];

interface LegacyV1Bean {
  id: string;
  name: string;
  roaster?: string;
  roast: RoastLevel;
  grind: string;
  method: BrewMethod;
  ratio: number;
  notes?: string;
}

interface LegacyV1 {
  beans?: LegacyV1Bean[];
  brews?: Brew[];
}

function migrateLegacy(raw: string): Persisted | null {
  try {
    const parsed = JSON.parse(raw) as LegacyV1;
    const beans: Bean[] = (parsed.beans ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      roaster: b.roaster,
      roast: b.roast,
      grind: b.grind,
      method: b.method,
      ratio: b.ratio,
      notes: b.notes,
      created_at: new Date().toISOString(),
    }));
    return {
      beans: beans.length > 0 ? beans : SEED_BEANS,
      brews: parsed.brews ?? [],
      tasting_notes: [],
    };
  } catch {
    return null;
  }
}

export function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Persisted>;
      return {
        beans:
          Array.isArray(parsed.beans) && parsed.beans.length > 0 ? parsed.beans : SEED_BEANS,
        brews: Array.isArray(parsed.brews) ? parsed.brews : [],
        tasting_notes: Array.isArray(parsed.tasting_notes) ? parsed.tasting_notes : [],
      };
    }
    // Migrate from v1 if present.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = migrateLegacy(legacy);
      if (migrated) return migrated;
    }
  } catch {
    /* fall through */
  }
  return { beans: SEED_BEANS, brews: [], tasting_notes: [] };
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

export function todayIso(): string {
  return TODAY();
}

export type { Persisted };
