/**
 * Baker's percentages — the canonical recipe table. Every number is
 * a percentage of the flour weight (which is always 100%). The schedule
 * minutes anchor the working-back calculation.
 */

export type Leaven = 'instant-yeast' | 'fresh-yeast' | 'sourdough' | 'poolish';

export interface Recipe {
  id: string;
  name: string;
  description: string;
  /** Hydration as % of flour (water / flour × 100). 60 = stiff, 80 = wet. */
  hydration: number;
  salt: number; // % of flour
  leaven: Leaven;
  /** Leavening agent as % of flour. */
  leavenPct: number;
  /** Default ball / loaf weight in grams. */
  defaultBallG: number;
  /** Default number of balls / loaves. */
  defaultBalls: number;
  /** Schedule, working backwards from "ready". */
  schedule: ScheduleStep[];
}

export interface ScheduleStep {
  label: string;
  /** Minutes this step takes. */
  minutes: number;
  /** Free-form note. */
  note?: string;
}

export const RECIPES: ReadonlyArray<Recipe> = [
  {
    id: 'pizza-napoletana',
    name: 'Pizza Napoletana',
    description: '24-hour cold-proof; 60% hydration; chewy, charred, classic.',
    hydration: 60,
    salt: 2.8,
    leaven: 'fresh-yeast',
    leavenPct: 0.1,
    defaultBallG: 250,
    defaultBalls: 4,
    schedule: [
      { label: 'Mix + autolyse', minutes: 30, note: 'Dough rest after rough mix.' },
      { label: 'Bulk ferment (room temp)', minutes: 90 },
      { label: 'Ball + cold proof', minutes: 24 * 60, note: '24h in the fridge — flavour builds here.' },
      { label: 'Counter rest before stretching', minutes: 60, note: 'Pull from fridge 1h ahead so they relax.' },
    ],
  },
  {
    id: 'pizza-ny',
    name: 'Pizza, NY-style',
    description: '64% hydration with a touch of oil + sugar for that floppy chew.',
    hydration: 64,
    salt: 2.5,
    leaven: 'instant-yeast',
    leavenPct: 0.4,
    defaultBallG: 280,
    defaultBalls: 3,
    schedule: [
      { label: 'Mix to gluten window', minutes: 12, note: 'Develop a smooth ball — slap-and-fold ok.' },
      { label: 'Bulk ferment (room)', minutes: 60 },
      { label: 'Ball + cold proof', minutes: 24 * 60 },
      { label: 'Counter rest', minutes: 90 },
    ],
  },
  {
    id: 'sourdough-boule',
    name: 'Sourdough boule',
    description: '76% hydration; bulk + 4 stretch-and-folds; cold retard.',
    hydration: 76,
    salt: 2,
    leaven: 'sourdough',
    leavenPct: 20,
    defaultBallG: 900,
    defaultBalls: 1,
    schedule: [
      { label: 'Levain build', minutes: 5 * 60, note: 'Starter peaks ~5h after feed; warmer kitchen = faster.' },
      { label: 'Autolyse', minutes: 60 },
      { label: 'Mix + 4 stretch-and-folds', minutes: 120, note: 'Fold every 30 min; bulk ends at ~50% rise.' },
      { label: 'Pre-shape + bench rest', minutes: 25 },
      { label: 'Final shape + cold retard', minutes: 12 * 60, note: 'Score cold, straight from the fridge.' },
    ],
  },
  {
    id: 'poolish-baguette',
    name: 'Poolish baguette',
    description: 'Overnight 100% hydration poolish + final dough; open crumb.',
    hydration: 70,
    salt: 2,
    leaven: 'poolish',
    leavenPct: 30,
    defaultBallG: 350,
    defaultBalls: 4,
    schedule: [
      { label: 'Build poolish', minutes: 12 * 60, note: '12-16h overnight at room temp until domed.' },
      { label: 'Mix final dough', minutes: 15 },
      { label: 'Bulk ferment + folds', minutes: 90 },
      { label: 'Pre-shape', minutes: 20 },
      { label: 'Final proof', minutes: 60, note: 'Couche or floured tea towel, score steeply.' },
    ],
  },
  {
    id: 'focaccia',
    name: 'Focaccia',
    description: '80% hydration, big bubbles, dimpled and oily.',
    hydration: 80,
    salt: 2.2,
    leaven: 'instant-yeast',
    leavenPct: 0.8,
    defaultBallG: 1000,
    defaultBalls: 1,
    schedule: [
      { label: 'Mix', minutes: 10 },
      { label: 'Bulk ferment + folds', minutes: 4 * 60, note: 'Stretch + fold every hour for the first 2h.' },
      { label: 'Cold ferment', minutes: 12 * 60, note: 'Optional but worth it for flavour.' },
      { label: 'Pan + final proof', minutes: 90, note: 'Dimple just before baking, fingers oiled.' },
    ],
  },
  {
    id: 'rye-loaf',
    name: 'Rye loaf',
    description: '70% rye + 30% wheat; tight crumb; sour tang.',
    hydration: 75,
    salt: 1.8,
    leaven: 'sourdough',
    leavenPct: 25,
    defaultBallG: 850,
    defaultBalls: 1,
    schedule: [
      { label: 'Levain build', minutes: 4 * 60 },
      { label: 'Mix + bulk', minutes: 3 * 60, note: 'Rye doesn\'t need stretch-and-fold — just rest.' },
      { label: 'Pan + final proof', minutes: 90 },
    ],
  },
  {
    id: 'brioche',
    name: 'Brioche',
    description: 'Egg + butter enriched; shaggy → silky over a long mix.',
    hydration: 50,
    salt: 1.5,
    leaven: 'instant-yeast',
    leavenPct: 1,
    defaultBallG: 60,
    defaultBalls: 8,
    schedule: [
      { label: 'Mix to silk', minutes: 25, note: 'Add butter slowly once the gluten is built.' },
      { label: 'Bulk ferment', minutes: 60 },
      { label: 'Cold proof', minutes: 12 * 60, note: 'Cold dough is workable; warm dough is melted butter.' },
      { label: 'Shape + final proof', minutes: 60 },
    ],
  },
];

export interface DoughRequirements {
  flour_g: number;
  water_g: number;
  salt_g: number;
  leaven_g: number;
  total_g: number;
}

/**
 * Compute gram quantities from baker's percentages + target dough weight.
 * Total dough weight = flour × (100 + hydration + salt + leavenPct) / 100.
 * We invert that to get flour-g.
 */
export function compute(recipe: Recipe, balls: number, ballG: number): DoughRequirements {
  const totalG = balls * ballG;
  const totalPct = 100 + recipe.hydration + recipe.salt + recipe.leavenPct;
  const flourG = Math.round((totalG * 100) / totalPct);
  const waterG = Math.round((flourG * recipe.hydration) / 100);
  const saltG = Math.round((flourG * recipe.salt) / 100 * 10) / 10;
  const leavenG = Math.round((flourG * recipe.leavenPct) / 100 * 10) / 10;
  return { flour_g: flourG, water_g: waterG, salt_g: saltG, leaven_g: leavenG, total_g: flourG + waterG + saltG + leavenG };
}

export function totalScheduleMinutes(recipe: Recipe): number {
  return recipe.schedule.reduce((sum, s) => sum + s.minutes, 0);
}

export interface ScheduledStep extends ScheduleStep {
  start_at: Date;
  end_at: Date;
}

/**
 * Working backwards from `readyAt`, attach a wall-clock start/end to
 * each step so the user can see "mix at 6:42 PM, ferment until 8:12 PM".
 */
export function planFromReady(recipe: Recipe, readyAt: Date): ScheduledStep[] {
  const out: ScheduledStep[] = [];
  let cursor = readyAt.getTime();
  // Walk steps in reverse so we know each step's end before its start.
  for (let i = recipe.schedule.length - 1; i >= 0; i--) {
    const step = recipe.schedule[i]!;
    const end = new Date(cursor);
    const start = new Date(cursor - step.minutes * 60_000);
    out.unshift({ ...step, start_at: start, end_at: end });
    cursor = start.getTime();
  }
  return out;
}

export function formatHM(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
