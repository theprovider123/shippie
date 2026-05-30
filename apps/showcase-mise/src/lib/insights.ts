/**
 * Mise — neutral pattern insights.
 *
 * Every card is descriptive, not evaluative. We never say a day was bad,
 * never use red/failure framing, never apply streak pressure. A "watch"
 * tone means "here's information about a line you set", not "you failed".
 * Cards only appear when there's real signal behind them.
 */
import type { Entry, Goals, Mode, Slot } from './types';
import {
  hourOf,
  mealTiming,
  progressToward,
  proteinBySlot,
  totalsForEntries,
  withinCeiling,
} from './nutrition';
import { SLOT_LABEL } from './foods-data';
import type { ExternalContext } from './intents';
import { dayKey, sameDay } from './dates';

export type InsightTone = 'note' | 'positive' | 'watch';
export type InsightKind =
  | 'protein'
  | 'spread'
  | 'hydration'
  | 'caffeine'
  | 'fueling'
  | 'cycle'
  | 'regularity'
  | 'sodium'
  | 'fiber'
  | 'energy';

export interface Insight {
  id: string;
  kind: InsightKind;
  tone: InsightTone;
  title: string;
  body: string;
}

export interface InsightInput {
  todayEntries: readonly Entry[];
  allEntries: readonly Entry[];
  goals: Goals;
  external: ExternalContext;
  now?: Date;
}

const NON_DRINK: Slot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function g(n: number): string {
  return `${Math.round(n)} g`;
}

function proteinInsight(i: InsightInput): Insight | null {
  const t = totalsForEntries(i.todayEntries);
  const target = i.goals.targets.protein_g;
  if (target <= 0) return null;
  const p = progressToward(t.protein_g, target);
  if (i.todayEntries.length === 0) return null;
  if (p.reached) {
    return {
      id: `protein-${dayKey(i.now ?? new Date())}`,
      kind: 'protein',
      tone: 'positive',
      title: 'Protein line reached',
      body: `${g(t.protein_g)} logged — at your ${g(target)} reference for today.`,
    };
  }
  return {
    id: `protein-${dayKey(i.now ?? new Date())}`,
    kind: 'protein',
    tone: 'note',
    title: 'Protein so far',
    body: `${g(t.protein_g)} of ${g(target)} — ${g(p.remaining)} would meet today's line. A protein-forward snack closes most gaps.`,
  };
}

function spreadInsight(i: InsightInput): Insight | null {
  const byslot = proteinBySlot(i.todayEntries);
  const total = NON_DRINK.reduce((s, sl) => s + byslot[sl], 0);
  if (total < 20) return null;
  const slotsWithFood = NON_DRINK.filter((sl) => byslot[sl] > 0);
  if (slotsWithFood.length < 2) return null;
  let topSlot: Slot = slotsWithFood[0]!;
  for (const sl of slotsWithFood) if (byslot[sl] > byslot[topSlot]) topSlot = sl;
  const share = byslot[topSlot] / total;
  if (share <= 0.6) {
    return {
      id: `spread-${dayKey(i.now ?? new Date())}`,
      kind: 'spread',
      tone: 'positive',
      title: 'Protein well spread',
      body: `Today's protein is spread across ${slotsWithFood.length} meals — steady supply through the day.`,
    };
  }
  return {
    id: `spread-${dayKey(i.now ?? new Date())}`,
    kind: 'spread',
    tone: 'note',
    title: 'Protein clustered',
    body: `Most of today's protein landed at ${SLOT_LABEL[topSlot].toLowerCase()}. Moving some to other meals can help you use it.`,
  };
}

function hydrationInsight(i: InsightInput): Insight | null {
  const t = totalsForEntries(i.todayEntries);
  const target = i.goals.targets.water_ml;
  if (target <= 0 || t.water_ml <= 0) return null;
  const p = progressToward(t.water_ml, target);
  if (p.reached) {
    return {
      id: `hydration-${dayKey(i.now ?? new Date())}`,
      kind: 'hydration',
      tone: 'positive',
      title: 'Hydration goal met',
      body: `${Math.round(t.water_ml)} ml of fluid logged today.`,
    };
  }
  return {
    id: `hydration-${dayKey(i.now ?? new Date())}`,
    kind: 'hydration',
    tone: 'note',
    title: 'Fluids today',
    body: `${Math.round(t.water_ml)} ml of ${Math.round(target)} ml — about ${Math.max(1, Math.round(p.remaining / 250))} more glass(es) to your goal.`,
  };
}

function caffeineInsight(i: InsightInput): Insight | null {
  const now = i.now ?? new Date();
  const cutoff = i.goals.targets.caffeine_cutoff_hour;
  const lateMg = i.todayEntries
    .filter((e) => e.nutrients.caffeine_mg > 0 && hourOf(e.logged_at) >= cutoff)
    .reduce((s, e) => s + e.nutrients.caffeine_mg, 0);
  const total = totalsForEntries(i.todayEntries).caffeine_mg;
  const c = withinCeiling(total, i.goals.targets.caffeine_mg);
  if (lateMg >= 30) {
    return {
      id: `caffeine-late-${dayKey(now)}`,
      kind: 'caffeine',
      tone: 'watch',
      title: 'Late caffeine',
      body: `${Math.round(lateMg)} mg after ${cutoff}:00. Caffeine has a long half-life — it can still be around at bedtime.`,
    };
  }
  if (c.over) {
    return {
      id: `caffeine-total-${dayKey(now)}`,
      kind: 'caffeine',
      tone: 'watch',
      title: 'Caffeine above your line',
      body: `${Math.round(total)} mg today, past your ${Math.round(c.ceiling)} mg line. Just so you know — no harm in a decaf next.`,
    };
  }
  return null;
}

function sodiumInsight(i: InsightInput): Insight | null {
  const t = totalsForEntries(i.todayEntries);
  const c = withinCeiling(t.sodium_mg, i.goals.targets.sodium_mg);
  if (i.todayEntries.length === 0) return null;
  if (c.over) {
    return {
      id: `sodium-${dayKey(i.now ?? new Date())}`,
      kind: 'sodium',
      tone: 'watch',
      title: 'Sodium above your watch line',
      body: `${Math.round(t.sodium_mg)} mg vs ${Math.round(c.ceiling)} mg. Often it's one or two salty items — worth a glance, not a worry.`,
    };
  }
  return null;
}

function fiberInsight(i: InsightInput): Insight | null {
  const t = totalsForEntries(i.todayEntries);
  const target = i.goals.targets.fiber_g;
  if (target <= 0 || i.todayEntries.length === 0) return null;
  const p = progressToward(t.fiber_g, target);
  if (p.reached) {
    return {
      id: `fiber-${dayKey(i.now ?? new Date())}`,
      kind: 'fiber',
      tone: 'positive',
      title: 'Fiber goal met',
      body: `${g(t.fiber_g)} of fiber — plants are doing their work today.`,
    };
  }
  if (p.ratio < 0.5) {
    return {
      id: `fiber-${dayKey(i.now ?? new Date())}`,
      kind: 'fiber',
      tone: 'note',
      title: 'Room for fiber',
      body: `${g(t.fiber_g)} of ${g(target)}. Fruit, beans, or whole grains add it quickly.`,
    };
  }
  return null;
}

function fuelingInsight(i: InsightInput): Insight | null {
  const now = i.now ?? new Date();
  const trainedToday = i.external.workouts.some((w) => sameDay(w.at, now));
  if (!trainedToday) return null;
  const t = totalsForEntries(i.todayEntries);
  const proteinTarget = i.goals.targets.protein_g;
  if (t.protein_g >= proteinTarget * 0.6) {
    return {
      id: `fueling-${dayKey(now)}`,
      kind: 'fueling',
      tone: 'positive',
      title: 'Training fueled',
      body: `You trained today and protein is tracking well — good recovery support.`,
    };
  }
  return {
    id: `fueling-${dayKey(now)}`,
    kind: 'fueling',
    tone: 'note',
    title: 'Recovery window',
    body: `You logged a workout today. Protein with some carbs in the next while supports recovery.`,
  };
}

function cycleInsight(i: InsightInput): Insight | null {
  const latest = i.external.cycle[0];
  if (!latest?.phase) return null;
  const phase = latest.phase.toLowerCase();
  if (phase.includes('luteal')) {
    return {
      id: `cycle-${dayKey(i.now ?? new Date())}`,
      kind: 'cycle',
      tone: 'note',
      title: 'Luteal phase',
      body: `Appetite, iron, and magnesium needs can rise here. Iron-rich foods and a touch more energy are common and fine.`,
    };
  }
  if (phase.includes('menstrual') || phase.includes('period')) {
    return {
      id: `cycle-${dayKey(i.now ?? new Date())}`,
      kind: 'cycle',
      tone: 'note',
      title: 'Menstrual phase',
      body: `Iron and fluids matter this week. Leafy greens, legumes, and steady meals help.`,
    };
  }
  return null;
}

function regularityInsight(i: InsightInput): Insight | null {
  const food = i.todayEntries.filter((e) => e.slot !== 'drink');
  const timing = mealTiming(food);
  if (timing.count < 2) return null;
  if (timing.largestGapHours >= 6) {
    return {
      id: `regularity-${dayKey(i.now ?? new Date())}`,
      kind: 'regularity',
      tone: 'note',
      title: 'Long gap between meals',
      body: `A ${timing.largestGapHours.toFixed(0)}-hour stretch without food today. Regular meals keep energy even — no rule, just a pattern.`,
    };
  }
  return null;
}

function energyInsight(i: InsightInput): Insight | null {
  const recentMoods = i.external.moods.slice(0, 5);
  if (recentMoods.length < 3) return null;
  return {
    id: `energy-${dayKey(i.now ?? new Date())}`,
    kind: 'energy',
    tone: 'note',
    title: 'Energy & food',
    body: `You've been logging mood alongside meals. Over time, Patterns will surface how breakfast size and energy line up for you.`,
  };
}

const MODE_PRIORITY: Record<Mode, InsightKind[]> = {
  maintenance: ['protein', 'spread', 'hydration', 'regularity'],
  'muscle-gain': ['protein', 'spread', 'fueling', 'hydration'],
  'fat-loss': ['protein', 'fiber', 'spread', 'regularity'],
  endurance: ['fueling', 'hydration', 'protein', 'caffeine'],
  'cycle-aware': ['cycle', 'protein', 'fiber', 'hydration'],
  'general-energy': ['regularity', 'protein', 'hydration', 'energy'],
  'sodium-watch': ['sodium', 'hydration', 'protein'],
  'fiber-watch': ['fiber', 'protein', 'hydration'],
  'protein-watch': ['protein', 'spread', 'fueling'],
};

/** Build the ordered, deduped insight list for the Patterns surface. */
export function buildInsights(input: InsightInput, limit = 6): Insight[] {
  const generators = [
    proteinInsight,
    spreadInsight,
    hydrationInsight,
    caffeineInsight,
    fuelingInsight,
    cycleInsight,
    regularityInsight,
    sodiumInsight,
    fiberInsight,
    energyInsight,
  ];
  const all = generators.map((fn) => fn(input)).filter((x): x is Insight => x != null);

  const priority = MODE_PRIORITY[input.goals.mode] ?? [];
  const rank = (ins: Insight) => {
    const idx = priority.indexOf(ins.kind);
    const base = idx >= 0 ? idx : priority.length + 1;
    // Within a tier, surface watches and positives a touch above plain notes.
    const toneBump = ins.tone === 'watch' ? -0.5 : ins.tone === 'positive' ? -0.25 : 0;
    return base + toneBump;
  };
  all.sort((a, b) => rank(a) - rank(b));
  return all.slice(0, limit);
}
