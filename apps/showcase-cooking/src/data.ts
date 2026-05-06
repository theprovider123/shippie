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

/**
 * Coarse protein family — drives wood-pellet pairings, smoke-point cues
 * for fats, sauce families. Inferred from `cut.id` prefix.
 */
export type Protein = 'beef' | 'pork' | 'poultry' | 'fish' | 'lamb';

export const METHOD_LABEL: Record<Method, string> = {
  'sous-vide': 'Sous vide',
  smoke: 'Smoke',
  roast: 'Roast',
  grill: 'Grill',
  pan: 'Pan',
};

export const METHOD_BLURB: Record<Method, string> = {
  'sous-vide':
    'Edge-to-edge doneness in a temperature-controlled bath. The protein cannot exceed bath temp, so timing is forgiving — texture, not safety, is the limit.',
  smoke:
    'Low-and-slow on a pit. The collagen breakdown clock runs from 70°C upward; the stall around 70°C is water cooling the surface. Wrap or ride.',
  roast:
    'Dry convection in an oven. Maillard happens at the surface; carryover finishes the centre after you pull. Rest is non-negotiable.',
  grill:
    'Direct flame for char, indirect zone for finish. Lid open vents steam (crisp), lid closed traps it (smoke + faster cook).',
  pan:
    'Conduction sear. Maillard browning starts ~140°C; smoke point of the fat is the ceiling. Deglaze the fond — that is the sauce.',
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
  /** Inferred protein family — for wood pairings, sauce hints. */
  protein: Protein;
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
    protein: 'beef',
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
    protein: 'beef',
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
    protein: 'beef',
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
    protein: 'beef',
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
    protein: 'pork',
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
    protein: 'pork',
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
    protein: 'pork',
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
    protein: 'poultry',
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
    protein: 'poultry',
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
    protein: 'poultry',
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
    protein: 'poultry',
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
    protein: 'fish',
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
    protein: 'fish',
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
    protein: 'fish',
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
    protein: 'lamb',
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
    protein: 'lamb',
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

/** Format seconds as "1:23:45" or "12:34" — for live timers. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────
// Internal-temp safety + ideal-doneness reference card.
// USDA safe-internal-temps cross-checked with ChefSteps doneness.
// ─────────────────────────────────────────────────────────────

export interface TempCardEntry {
  protein: string;
  /** USDA safe minimum (°C). */
  safe_c: number;
  /** Ideal pull temp (°C) — accounts for carryover. */
  ideal_c: number;
  /** One-line explainer. */
  note: string;
}

export const TEMP_CARD: ReadonlyArray<TempCardEntry> = [
  { protein: 'Beef — steak / roast', safe_c: 63, ideal_c: 54, note: 'Whole-muscle beef is sterile inside; the surface sear handles the rest. Pull at 54°C for med-rare; carryover lifts ~3°C.' },
  { protein: 'Beef — ground', safe_c: 71, ideal_c: 71, note: 'Ground meat distributes surface bacteria throughout — no rare burgers from supermarket grind.' },
  { protein: 'Beef — brisket / short rib', safe_c: 63, ideal_c: 96, note: 'Tough cuts cook past safety into collagen-melt territory. Probe-tender, not temp, is the real signal at 93–96°C.' },
  { protein: 'Pork — chops / loin', safe_c: 63, ideal_c: 63, note: 'Modern pork is pink at 63°C and that is fine. Trichinosis is a 1950s memory.' },
  { protein: 'Pork — shoulder / ribs', safe_c: 63, ideal_c: 93, note: 'Pulls clean at 93°C; ribs at bend test (lift one end, surface cracks).' },
  { protein: 'Chicken — breast', safe_c: 74, ideal_c: 64, note: 'USDA says 74°C. Sous vide at 60°C/1h pasteurises and stays juicy — equivalent safety, better texture.' },
  { protein: 'Chicken — thigh / dark', safe_c: 74, ideal_c: 75, note: 'Dark meat wants 75°C+ — connective tissue needs to render or it goes rubbery.' },
  { protein: 'Turkey', safe_c: 74, ideal_c: 74, note: 'Breast and thigh have different ideals; pull breast at 71°C, thigh at 75°C, rest unifies them.' },
  { protein: 'Salmon', safe_c: 63, ideal_c: 50, note: '50°C: silky, almost sashimi. 54°C: classic flaky. 63°C: dry. Most home cooks overshoot.' },
  { protein: 'White fish (cod, haddock)', safe_c: 63, ideal_c: 55, note: 'Done when it flakes with a fork — 55°C centre is the sweet spot.' },
  { protein: 'Tuna', safe_c: 63, ideal_c: 49, note: 'Best rare. Sear edges, pull at 49°C — anything more turns it to canned.' },
  { protein: 'Lamb — chop / rack', safe_c: 63, ideal_c: 54, note: 'Treat like beef. 54°C med-rare; rest brings it to 57°C.' },
  { protein: 'Lamb — leg / shoulder', safe_c: 63, ideal_c: 60, note: 'Roast: 60°C for medium. Slow shoulder: 88°C+ for pull-apart.' },
];

// ─────────────────────────────────────────────────────────────
// Wood / pellet pairings for smoking. Based on consensus from
// pitmaster sources — not exhaustive, but a reliable starting line.
// ─────────────────────────────────────────────────────────────

export interface WoodPairing {
  protein: Protein;
  /** First-choice woods, ordered by classic-pairing weight. */
  best: ReadonlyArray<string>;
  /** Also-acceptable woods. */
  good: ReadonlyArray<string>;
  /** Avoid — flavour clash or overpowering. */
  avoid: ReadonlyArray<string>;
  /** One-line rationale. */
  note: string;
}

export const WOOD_PAIRINGS: ReadonlyArray<WoodPairing> = [
  {
    protein: 'beef',
    best: ['oak', 'post oak', 'hickory'],
    good: ['mesquite (sparingly)', 'pecan'],
    avoid: ['alder', 'apple alone'],
    note: 'Beef takes assertive smoke. Oak is the Texas default; hickory pushes harder. Mesquite is for short cooks — it goes acrid past 4h.',
  },
  {
    protein: 'pork',
    best: ['apple', 'cherry', 'hickory'],
    good: ['pecan', 'maple'],
    avoid: ['mesquite (long cooks)'],
    note: 'Pork loves fruit woods. Apple is gentle, cherry adds colour, hickory grounds it. A 50/50 apple+hickory blend is a workhorse.',
  },
  {
    protein: 'poultry',
    best: ['apple', 'cherry', 'pecan'],
    good: ['maple', 'alder'],
    avoid: ['mesquite', 'hickory (heavy)'],
    note: 'Poultry skin absorbs smoke fast. Stay light and fruity — heavy woods overwhelm the meat.',
  },
  {
    protein: 'fish',
    best: ['alder', 'cherry'],
    good: ['apple', 'maple'],
    avoid: ['hickory', 'mesquite', 'oak'],
    note: 'Fish is the most delicate. Alder is the Pacific Northwest default for salmon for good reason.',
  },
  {
    protein: 'lamb',
    best: ['oak', 'cherry', 'pecan'],
    good: ['hickory', 'apple'],
    avoid: ['mesquite (long)'],
    note: 'Lamb is forgiving — fatty enough to handle most woods. Cherry adds a distinctive sweetness that suits the gameyness.',
  },
];

// ─────────────────────────────────────────────────────────────
// Fat smoke points — for pan / sear decisions.
// ─────────────────────────────────────────────────────────────

export interface FatSmokePoint {
  fat: string;
  smoke_point_c: number;
  use: string;
}

export const FAT_SMOKE_POINTS: ReadonlyArray<FatSmokePoint> = [
  { fat: 'Butter', smoke_point_c: 150, use: 'Finishing baste, low-temp eggs. Browns past 150°C — fine for ghee, not for high sear.' },
  { fat: 'Olive oil (extra virgin)', smoke_point_c: 190, use: 'Medium heat. Use refined (not EVOO) for hard sears.' },
  { fat: 'Lard / tallow', smoke_point_c: 190, use: 'Steak fat. Beef tallow is the in-n-out steakhouse secret.' },
  { fat: 'Avocado oil', smoke_point_c: 270, use: 'The cleanest neutral high-heat fat. Searing default.' },
  { fat: 'Refined canola / grapeseed', smoke_point_c: 230, use: 'Cheap high-heat. Neutral, no flavour to give.' },
  { fat: 'Ghee (clarified butter)', smoke_point_c: 250, use: 'Butter flavour without the milk solids burning.' },
];

/** Look up a wood pairing by protein. */
export function woodPairingFor(protein: Protein): WoodPairing {
  return WOOD_PAIRINGS.find((w) => w.protein === protein) ?? WOOD_PAIRINGS[0]!;
}

/** Look up a temp-card entry by cut id. Best-effort substring match. */
export function tempCardFor(cut: Cut): TempCardEntry | null {
  // Direct cut-id mappings for the cases the substring match would miss
  const idMap: Record<string, string> = {
    'beef-steak': 'Beef — steak / roast',
    'beef-roast': 'Beef — steak / roast',
    'beef-brisket': 'Beef — brisket / short rib',
    'beef-short-rib': 'Beef — brisket / short rib',
    'pork-loin-chop': 'Pork — chops / loin',
    'pork-shoulder': 'Pork — shoulder / ribs',
    'pork-ribs': 'Pork — shoulder / ribs',
    'chicken-breast': 'Chicken — breast',
    'chicken-thigh': 'Chicken — thigh / dark',
    'chicken-whole': 'Chicken — thigh / dark',
    'turkey-whole': 'Turkey',
    salmon: 'Salmon',
    'white-fish': 'White fish (cod, haddock)',
    'tuna-steak': 'Tuna',
    'lamb-chop': 'Lamb — chop / rack',
    'lamb-leg': 'Lamb — leg / shoulder',
  };
  const target = idMap[cut.id];
  if (!target) return null;
  return TEMP_CARD.find((e) => e.protein === target) ?? null;
}
