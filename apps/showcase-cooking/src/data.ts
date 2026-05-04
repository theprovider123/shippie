/**
 * Curated cook lookup. Hand-rolled — small enough to keep accurate,
 * big enough to cover the dinners people actually make. Times and
 * temperatures cross-checked against ChefSteps + Serious Eats food
 * lab references; if a number looks off in real life, this table is
 * the place to fix it (every consumer reads from one source).
 *
 * Times are minutes-per-kilo for roast/oven cuts; minutes (absolute)
 * for sous vide / smoke / grill / pan. Internal temps in °C.
 */

export type Method = 'sous-vide' | 'smoke' | 'roast' | 'grill' | 'pan';

export type Doneness = 'rare' | 'med-rare' | 'medium' | 'med-well' | 'well-done';

export const METHOD_LABEL: Record<Method, string> = {
  'sous-vide': 'Sous vide',
  smoke: 'Smoke',
  roast: 'Roast',
  grill: 'Grill',
  pan: 'Pan',
};

export const DONENESS_TEMP_C: Record<Doneness, number> = {
  rare: 52,
  'med-rare': 56,
  medium: 60,
  'med-well': 65,
  'well-done': 71,
};

export const DONENESS_LABEL: Record<Doneness, string> = {
  rare: 'rare',
  'med-rare': 'med-rare',
  medium: 'medium',
  'med-well': 'med-well',
  'well-done': 'well-done',
};

export interface Cut {
  id: string;
  name: string;
  /** Methods supported, ordered by "best fit". */
  methods: ReadonlyArray<Method>;
  /** When true, the doneness picker shows. Stews/braises ignore it. */
  donenessApplies: boolean;
  /** Default doneness if it applies. */
  defaultDoneness?: Doneness;
  /** Per-method timing recipe. */
  timing: Partial<Record<Method, MethodTiming>>;
}

export interface MethodTiming {
  /** Override for internal target temp (e.g. brisket = 93°C / 200°F). */
  target_temp_c?: number;
  /** Constant cook time in minutes (smoking / sous vide / pan). */
  cook_minutes?: number;
  /** Time per kilogram (roast / smoke whole-cut). */
  minutes_per_kg?: number;
  /** Per-side minutes for grill/pan. */
  per_side_minutes?: number;
  /** Pit/oven temperature, if relevant. */
  pit_temp_c?: number;
  /** Rest time after cooking. */
  rest_minutes?: number;
  /** Free-form note (wood pairing, "watch the stall", etc). */
  note?: string;
}

export const CUTS: ReadonlyArray<Cut> = [
  // ── Beef ────────────────────────────────────────────────────
  {
    id: 'beef-steak',
    name: 'Steak (sirloin / ribeye)',
    methods: ['pan', 'grill', 'sous-vide'],
    donenessApplies: true,
    defaultDoneness: 'med-rare',
    timing: {
      pan: { per_side_minutes: 3, rest_minutes: 4, note: 'Hot pan, butter-baste, rest is non-negotiable.' },
      grill: { per_side_minutes: 3, rest_minutes: 4 },
      'sous-vide': { cook_minutes: 90, rest_minutes: 0, note: '1.5″ thickness baseline. 4h is max for tenderness.' },
    },
  },
  {
    id: 'beef-brisket',
    name: 'Brisket (whole)',
    methods: ['smoke'],
    donenessApplies: false,
    timing: {
      smoke: {
        target_temp_c: 93,
        minutes_per_kg: 90,
        pit_temp_c: 110,
        rest_minutes: 60,
        note: 'Stall around 71°C; wrap in butcher paper to push through. Oak or post-oak.',
      },
    },
  },
  {
    id: 'beef-short-rib',
    name: 'Short rib',
    methods: ['smoke', 'sous-vide'],
    donenessApplies: false,
    timing: {
      smoke: {
        target_temp_c: 96,
        minutes_per_kg: 75,
        pit_temp_c: 120,
        rest_minutes: 30,
      },
      'sous-vide': { cook_minutes: 1440, rest_minutes: 0, note: '24 hours at 60°C — silky.' },
    },
  },
  {
    id: 'beef-roast',
    name: 'Chuck roast / topside',
    methods: ['roast'],
    donenessApplies: true,
    defaultDoneness: 'medium',
    timing: {
      roast: { minutes_per_kg: 35, rest_minutes: 15, pit_temp_c: 175, note: '15 min at 220°C first to brown, then drop.' },
    },
  },
  // ── Pork ────────────────────────────────────────────────────
  {
    id: 'pork-shoulder',
    name: 'Pork shoulder',
    methods: ['smoke', 'roast'],
    donenessApplies: false,
    timing: {
      smoke: {
        target_temp_c: 93,
        minutes_per_kg: 90,
        pit_temp_c: 107,
        rest_minutes: 45,
        note: 'Apple or hickory. Pulls clean at 93°C internal.',
      },
      roast: { minutes_per_kg: 50, rest_minutes: 20, pit_temp_c: 150 },
    },
  },
  {
    id: 'pork-ribs',
    name: 'Pork ribs (baby back)',
    methods: ['smoke', 'grill'],
    donenessApplies: false,
    timing: {
      smoke: {
        cook_minutes: 360,
        pit_temp_c: 110,
        rest_minutes: 10,
        note: '3-2-1: 3h smoke, 2h wrapped with apple juice, 1h sauce.',
      },
      grill: { per_side_minutes: 8, note: 'Indirect heat, finish with sauce.' },
    },
  },
  {
    id: 'pork-loin-chop',
    name: 'Pork loin chop',
    methods: ['pan', 'grill', 'sous-vide'],
    donenessApplies: true,
    defaultDoneness: 'medium',
    timing: {
      pan: { per_side_minutes: 4, rest_minutes: 5 },
      grill: { per_side_minutes: 4, rest_minutes: 5 },
      'sous-vide': { cook_minutes: 60, rest_minutes: 0 },
    },
  },
  // ── Poultry ─────────────────────────────────────────────────
  {
    id: 'chicken-whole',
    name: 'Whole chicken',
    methods: ['roast', 'smoke'],
    donenessApplies: false,
    timing: {
      roast: { minutes_per_kg: 45, rest_minutes: 10, pit_temp_c: 200, target_temp_c: 74 },
      smoke: { minutes_per_kg: 90, pit_temp_c: 110, target_temp_c: 74, rest_minutes: 10 },
    },
  },
  {
    id: 'chicken-breast',
    name: 'Chicken breast',
    methods: ['sous-vide', 'pan', 'grill'],
    donenessApplies: false,
    timing: {
      'sous-vide': { cook_minutes: 90, target_temp_c: 64, note: 'Drier-than-poached at 64°C. Bag with butter + thyme.' },
      pan: { per_side_minutes: 5, rest_minutes: 4, target_temp_c: 74 },
      grill: { per_side_minutes: 6, rest_minutes: 4, target_temp_c: 74 },
    },
  },
  {
    id: 'chicken-thigh',
    name: 'Chicken thigh (bone-in)',
    methods: ['roast', 'grill', 'pan'],
    donenessApplies: false,
    timing: {
      roast: { cook_minutes: 35, pit_temp_c: 200, target_temp_c: 75 },
      grill: { per_side_minutes: 7, target_temp_c: 75 },
      pan: { per_side_minutes: 6, rest_minutes: 3, target_temp_c: 75 },
    },
  },
  {
    id: 'turkey-whole',
    name: 'Turkey (whole)',
    methods: ['roast', 'smoke'],
    donenessApplies: false,
    timing: {
      roast: { minutes_per_kg: 35, rest_minutes: 30, pit_temp_c: 165, target_temp_c: 74 },
      smoke: { minutes_per_kg: 60, pit_temp_c: 120, target_temp_c: 74, rest_minutes: 30 },
    },
  },
  // ── Fish + seafood ──────────────────────────────────────────
  {
    id: 'salmon',
    name: 'Salmon fillet',
    methods: ['sous-vide', 'pan', 'grill'],
    donenessApplies: true,
    defaultDoneness: 'med-rare',
    timing: {
      'sous-vide': { cook_minutes: 30, note: 'At 50°C: silky. 54°C: traditional flaky.' },
      pan: { per_side_minutes: 3, rest_minutes: 1, note: 'Skin down 3 min, flip 1 min.' },
      grill: { per_side_minutes: 3 },
    },
  },
  {
    id: 'white-fish',
    name: 'White fish (cod / haddock)',
    methods: ['pan', 'roast'],
    donenessApplies: false,
    timing: {
      pan: { per_side_minutes: 3, rest_minutes: 0 },
      roast: { cook_minutes: 12, pit_temp_c: 200 },
    },
  },
  {
    id: 'tuna-steak',
    name: 'Tuna steak',
    methods: ['pan', 'grill'],
    donenessApplies: true,
    defaultDoneness: 'rare',
    timing: {
      pan: { per_side_minutes: 1, note: 'Hot pan, sear edges only.' },
      grill: { per_side_minutes: 1 },
    },
  },
  // ── Lamb ────────────────────────────────────────────────────
  {
    id: 'lamb-leg',
    name: 'Leg of lamb',
    methods: ['roast', 'smoke'],
    donenessApplies: true,
    defaultDoneness: 'med-rare',
    timing: {
      roast: { minutes_per_kg: 30, rest_minutes: 15, pit_temp_c: 180 },
      smoke: { minutes_per_kg: 60, pit_temp_c: 120, rest_minutes: 20 },
    },
  },
  {
    id: 'lamb-chop',
    name: 'Lamb chop',
    methods: ['pan', 'grill'],
    donenessApplies: true,
    defaultDoneness: 'med-rare',
    timing: {
      pan: { per_side_minutes: 3, rest_minutes: 4 },
      grill: { per_side_minutes: 3, rest_minutes: 4 },
    },
  },
];

/**
 * Compute total cook minutes from cut + method + (optionally) weight.
 * Returns null if the timing recipe doesn't have enough info.
 */
export function computeCookMinutes(
  cut: Cut,
  method: Method,
  weight_kg: number | null,
): number | null {
  const t = cut.timing[method];
  if (!t) return null;
  if (typeof t.cook_minutes === 'number') return t.cook_minutes;
  if (typeof t.minutes_per_kg === 'number' && weight_kg && weight_kg > 0) {
    return Math.round(t.minutes_per_kg * weight_kg);
  }
  if (typeof t.per_side_minutes === 'number') return t.per_side_minutes * 2;
  return null;
}

/** Format minutes as "1h 35m" or "45m". */
export function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
