/**
 * Mise — modes & target generation.
 *
 * A mode seeds neutral daily reference targets. Protein is scaled to
 * bodyweight (g/kg) when known; energy is a light activity heuristic
 * (≈31 kcal/kg) adjusted per mode. Carbohydrate/fat split the remaining
 * energy by a mode-specific carb share. Everything here is a *starting
 * line* the user can edit — nothing is prescriptive or medical.
 */
import type { Mode, Targets } from './types';

export const DEFAULT_BODYWEIGHT_KG = 70;

export interface ModeMeta {
  id: Mode;
  label: string;
  /** One food-literate, non-judgemental line. */
  blurb: string;
  /** Grams of protein per kg bodyweight. */
  proteinPerKg: number;
  /** Energy multiplier vs. the maintenance heuristic. */
  energyFactor: number;
  /** Share of non-protein energy that comes from carbohydrate (0–1). */
  carbShare: number;
  /** Sodium watch line, mg. */
  sodium: number;
  /** Fiber goal, g. */
  fiber: number;
  /** Caffeine watch line, mg. */
  caffeine: number;
  caffeineCutoffHour: number;
  /** Extra hydration on top of the bodyweight estimate, ml. */
  waterBonus: number;
}

export const MODES: readonly ModeMeta[] = [
  {
    id: 'maintenance',
    label: 'Maintenance',
    blurb: 'Hold steady. Balanced plates, protein at each meal.',
    proteinPerKg: 1.6,
    energyFactor: 1.0,
    carbShare: 0.55,
    sodium: 2300,
    fiber: 30,
    caffeine: 400,
    caffeineCutoffHour: 14,
    waterBonus: 0,
  },
  {
    id: 'muscle-gain',
    label: 'Muscle gain',
    blurb: 'Build with a gentle surplus and protein spread across the day.',
    proteinPerKg: 2.0,
    energyFactor: 1.1,
    carbShare: 0.6,
    sodium: 2300,
    fiber: 35,
    caffeine: 400,
    caffeineCutoffHour: 15,
    waterBonus: 250,
  },
  {
    id: 'fat-loss',
    label: 'Fat loss',
    blurb: 'A moderate deficit with high protein and fiber for fullness.',
    proteinPerKg: 2.2,
    energyFactor: 0.8,
    carbShare: 0.45,
    sodium: 2300,
    fiber: 35,
    caffeine: 400,
    caffeineCutoffHour: 14,
    waterBonus: 250,
  },
  {
    id: 'endurance',
    label: 'Endurance fueling',
    blurb: 'Carbohydrate-forward for training days, with more fluid and sodium.',
    proteinPerKg: 1.6,
    energyFactor: 1.15,
    carbShare: 0.7,
    sodium: 2800,
    fiber: 32,
    caffeine: 400,
    caffeineCutoffHour: 16,
    waterBonus: 750,
  },
  {
    id: 'cycle-aware',
    label: 'Cycle-aware',
    blurb: 'Flexes with your cycle — a touch more in the luteal phase.',
    proteinPerKg: 1.8,
    energyFactor: 1.03,
    carbShare: 0.55,
    sodium: 2300,
    fiber: 32,
    caffeine: 300,
    caffeineCutoffHour: 14,
    waterBonus: 250,
  },
  {
    id: 'general-energy',
    label: 'General energy',
    blurb: 'Eat enough, regularly. Steady fuel over the day.',
    proteinPerKg: 1.4,
    energyFactor: 1.0,
    carbShare: 0.55,
    sodium: 2300,
    fiber: 30,
    caffeine: 400,
    caffeineCutoffHour: 14,
    waterBonus: 0,
  },
  {
    id: 'sodium-watch',
    label: 'Sodium watch',
    blurb: 'Keep an eye on sodium without making any food off-limits.',
    proteinPerKg: 1.6,
    energyFactor: 1.0,
    carbShare: 0.55,
    sodium: 1500,
    fiber: 30,
    caffeine: 400,
    caffeineCutoffHour: 14,
    waterBonus: 0,
  },
  {
    id: 'fiber-watch',
    label: 'Fiber focus',
    blurb: 'Lean into fiber — plants, legumes, whole grains.',
    proteinPerKg: 1.6,
    energyFactor: 1.0,
    carbShare: 0.58,
    sodium: 2300,
    fiber: 40,
    caffeine: 400,
    caffeineCutoffHour: 14,
    waterBonus: 250,
  },
  {
    id: 'protein-watch',
    label: 'Protein focus',
    blurb: 'Hit protein first; everything else follows.',
    proteinPerKg: 2.0,
    energyFactor: 1.0,
    carbShare: 0.5,
    sodium: 2300,
    fiber: 32,
    caffeine: 400,
    caffeineCutoffHour: 14,
    waterBonus: 0,
  },
];

export const MODE_BY_ID: ReadonlyMap<Mode, ModeMeta> = new Map(MODES.map((m) => [m.id, m]));

export function modeMeta(mode: Mode): ModeMeta {
  return MODE_BY_ID.get(mode) ?? MODES[0]!;
}

const round = (x: number, step: number) => Math.round(x / step) * step;

/** Generate neutral reference targets for a mode at a given bodyweight. */
export function targetsForMode(mode: Mode, bodyweightKg?: number): Targets {
  const m = modeMeta(mode);
  const bw = bodyweightKg && bodyweightKg > 0 ? bodyweightKg : DEFAULT_BODYWEIGHT_KG;

  const protein_g = round(bw * m.proteinPerKg, 5);
  const kcal = round(bw * 31 * m.energyFactor, 10);

  const proteinKcal = protein_g * 4;
  const remaining = Math.max(0, kcal - proteinKcal);
  const carb_g = round((remaining * m.carbShare) / 4, 5);
  const fat_g = round((remaining * (1 - m.carbShare)) / 9, 5);

  const water_ml = round(Math.max(2000, bw * 33) + m.waterBonus, 50);
  const protein_per_meal_g = Math.max(20, Math.round(protein_g / 4));

  return {
    kcal,
    protein_g,
    carb_g,
    fat_g,
    fiber_g: m.fiber,
    sodium_mg: m.sodium,
    water_ml,
    caffeine_mg: m.caffeine,
    caffeine_cutoff_hour: m.caffeineCutoffHour,
    protein_per_meal_g,
  };
}
