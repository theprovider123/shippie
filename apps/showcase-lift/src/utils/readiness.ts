/**
 * Readiness — Lift's quiet cross-app advantage.
 *
 * Other Shippie apps (a sleep tracker, a nutrition log, a cycle tracker)
 * broadcast intents. Lift consumes them and folds them into one honest
 * number: how recovered are you, right now, walking up to the bar?
 *
 * This is the autoregulation a paper logbook can never do — and a
 * cloud fitness app would only do by harvesting your whole life onto a
 * server. Here the signals arrive over the local intent bus, get scored
 * on-device, and never leave the phone.
 *
 * Design rules:
 *   - HONEST. No signals → no fabricated score. We say "unknown" and
 *     tell the user which app would light it up.
 *   - SUPPORTIVE, not punitive. A short-sleep night nudges load down with
 *     a reason, it doesn't scold. Cycle phase informs, never shames.
 *   - PURE. Scoring takes signals + `now`; the store layer feeds it.
 */

export type ReadinessBand = 'primed' | 'ready' | 'hold' | 'caution' | 'unknown';

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal' | 'unknown';

/**
 * Normalised recovery inputs. Every field optional — the store fills in
 * whatever the user's other apps have broadcast recently. A field left
 * undefined contributes nothing (we never punish a missing signal hard).
 */
export interface ReadinessSignals {
  /** Hours slept last night (sleep-logged). */
  sleepHours?: number | null;
  /** Subjective sleep quality 1–10 (sleep-logged). */
  sleepQuality?: number | null;
  /** Did the user hit their protein target today (protein-target-hit)? */
  proteinTargetHit?: boolean | null;
  /** Nutrition log says calories are notably under target (nutrition-logged). */
  nutritionUnderTarget?: boolean | null;
  /** Any hydration logged today (hydration-logged)? */
  hydrationLoggedToday?: boolean | null;
  /** Caffeine servings logged today (caffeine-logged). */
  caffeineCountToday?: number | null;
  /** Minutes since the most recent caffeine (caffeine-logged). */
  caffeineRecentMinutes?: number | null;
  /** Current menstrual-cycle phase (cycle-logged). */
  cyclePhase?: CyclePhase | null;
  /** Short-term bodyweight change, % (body-metrics-logged). Negative = drop. */
  bodyWeightDeltaPct?: number | null;
}

export interface ReadinessFactor {
  label: string;
  effect: 'up' | 'down' | 'neutral';
  detail: string;
}

export interface ReadinessResult {
  /** 0–100, or null when we have no signals to stand on. */
  score: number | null;
  band: ReadinessBand;
  /** One short, utilitarian line for the top of Today. */
  headline: string;
  /** What moved the needle, newest-signal-first. */
  factors: ReadinessFactor[];
  /** Plain-language autoregulation nudge for today's top set, or null. */
  loadAdvice: string | null;
  /** True when at least one real signal fed the score. */
  honest: boolean;
}

const BASE = 70;

/**
 * Score a set of recovery signals into a readiness verdict.
 *
 * The model is deliberately conservative and additive: start neutral,
 * apply bounded deltas per signal, clamp, then band. No single missing
 * signal can tank the score; no single signal can max it out.
 */
export function scoreReadiness(signals: ReadinessSignals): ReadinessResult {
  const factors: ReadinessFactor[] = [];
  let score = BASE;
  let realSignals = 0;

  // --- Sleep: the heaviest lever on next-day output. ---
  if (typeof signals.sleepHours === 'number') {
    realSignals++;
    const h = signals.sleepHours;
    if (h >= 7.5) {
      score += 12;
      factors.push({ label: 'Sleep', effect: 'up', detail: `${trim(h)}h — well rested` });
    } else if (h >= 6.5) {
      score += 4;
      factors.push({ label: 'Sleep', effect: 'up', detail: `${trim(h)}h — adequate` });
    } else if (h >= 5.5) {
      score -= 8;
      factors.push({ label: 'Sleep', effect: 'down', detail: `${trim(h)}h — a little short` });
    } else {
      score -= 18;
      factors.push({ label: 'Sleep', effect: 'down', detail: `${trim(h)}h — under-slept` });
    }
    // Quality is a small modifier on top of duration.
    if (typeof signals.sleepQuality === 'number') {
      if (signals.sleepQuality <= 4) score -= 4;
      else if (signals.sleepQuality >= 8) score += 3;
    }
  }

  // --- Fuel: protein + overall intake. ---
  if (signals.proteinTargetHit === true) {
    realSignals++;
    score += 6;
    factors.push({ label: 'Protein', effect: 'up', detail: 'target hit — recovery fuelled' });
  } else if (signals.proteinTargetHit === false) {
    realSignals++;
    score -= 4;
    factors.push({ label: 'Protein', effect: 'down', detail: 'under target so far today' });
  }

  if (signals.nutritionUnderTarget === true) {
    realSignals++;
    score -= 8;
    factors.push({ label: 'Fuel', effect: 'down', detail: 'calories under target — expect less in the tank' });
  } else if (signals.nutritionUnderTarget === false) {
    realSignals++;
    score += 3;
    factors.push({ label: 'Fuel', effect: 'up', detail: 'eating to target' });
  }

  if (signals.hydrationLoggedToday === true) {
    realSignals++;
    score += 3;
    factors.push({ label: 'Hydration', effect: 'up', detail: 'fluids logged today' });
  }

  // --- Caffeine: an acute boost pre-session, a debt if over-relied on. ---
  if (typeof signals.caffeineCountToday === 'number' && signals.caffeineCountToday > 0) {
    realSignals++;
    const recent =
      typeof signals.caffeineRecentMinutes === 'number' && signals.caffeineRecentMinutes <= 120;
    if (recent) {
      score += 5;
      factors.push({ label: 'Caffeine', effect: 'up', detail: 'recent dose — primed for output' });
    }
    if (signals.caffeineCountToday >= 4) {
      score -= 5;
      factors.push({ label: 'Caffeine', effect: 'down', detail: `${signals.caffeineCountToday} servings — watch the crash` });
    }
  }

  // --- Cycle phase: informational, supportive. ---
  if (signals.cyclePhase && signals.cyclePhase !== 'unknown') {
    realSignals++;
    switch (signals.cyclePhase) {
      case 'menstrual':
        score -= 6;
        factors.push({ label: 'Cycle', effect: 'down', detail: 'menstrual phase — listen to your body' });
        break;
      case 'luteal':
        score -= 3;
        factors.push({ label: 'Cycle', effect: 'down', detail: 'late luteal — slightly higher fatigue' });
        break;
      case 'follicular':
      case 'ovulation':
        score += 2;
        factors.push({ label: 'Cycle', effect: 'up', detail: `${signals.cyclePhase} phase — strength tends to peak` });
        break;
    }
  }

  // --- Bodyweight: a sharp short-term drop can flag under-fuelling/illness. ---
  if (typeof signals.bodyWeightDeltaPct === 'number') {
    realSignals++;
    if (signals.bodyWeightDeltaPct <= -1.5) {
      score -= 6;
      factors.push({ label: 'Bodyweight', effect: 'down', detail: `down ${trim(Math.abs(signals.bodyWeightDeltaPct))}% recently — check fuelling` });
    }
  }

  if (realSignals === 0) {
    return {
      score: null,
      band: 'unknown',
      headline: 'No recovery signals yet',
      factors: [],
      loadAdvice: null,
      honest: false,
    };
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const band = bandFor(score);
  return {
    score,
    band,
    headline: headlineFor(band, score),
    factors,
    loadAdvice: loadAdviceFor(band),
    honest: true,
  };
}

/**
 * Map an inbound intent broadcast to a partial signal patch.
 *
 * Defensive on payload shape: sibling apps evolve their schemas, so we
 * read several plausible field names rather than hard-coupling. Returns
 * null when the intent isn't one we consume or the rows are unusable.
 */
export function matchReadinessSignal(
  intent: string,
  rows: readonly unknown[],
): Partial<ReadinessSignals> | null {
  const row = lastObject(rows);
  if (!row) return null;

  switch (intent) {
    case 'sleep-logged': {
      const hours = num(row.sleep_hours ?? row.hours ?? row.duration_hours);
      const quality = num(row.quality ?? row.sleep_quality);
      const patch: Partial<ReadinessSignals> = {};
      if (hours != null) patch.sleepHours = hours;
      if (quality != null) patch.sleepQuality = quality;
      return Object.keys(patch).length ? patch : null;
    }
    case 'protein-target-hit': {
      // Presence of this intent generally means hit; honour an explicit flag.
      const hit = bool(row.hit ?? row.target_hit ?? row.met);
      return { proteinTargetHit: hit ?? true };
    }
    case 'nutrition-logged': {
      const cals = num(row.calories ?? row.kcal);
      const target = num(row.target ?? row.target_calories ?? row.goal);
      const explicit = bool(row.under_target);
      if (explicit != null) return { nutritionUnderTarget: explicit };
      if (cals != null && target != null && target > 0) {
        return { nutritionUnderTarget: cals < target * 0.85 };
      }
      return { nutritionUnderTarget: false };
    }
    case 'hydration-logged':
      return { hydrationLoggedToday: true };
    case 'caffeine-logged': {
      const count = num(row.count ?? row.servings) ?? 1;
      return { caffeineCountToday: count, caffeineRecentMinutes: 0 };
    }
    case 'cycle-logged': {
      const phase = normalisePhase(str(row.phase ?? row.cycle_phase));
      return phase ? { cyclePhase: phase } : null;
    }
    case 'body-metrics-logged': {
      const w = num(row.weight_kg ?? row.weight ?? row.bodyweight ?? row.mass_kg);
      // The store turns a raw weight into a delta; pass it through under a
      // private channel by encoding as delta-from-self = 0 here. The store
      // owns history, so it overrides this with a real delta.
      return w != null ? { bodyWeightDeltaPct: 0 } : null;
    }
    default:
      return null;
  }
}

/** The seven inbound intents Lift consumes for readiness. */
export const CONSUMED_INTENTS = [
  'sleep-logged',
  'nutrition-logged',
  'protein-target-hit',
  'hydration-logged',
  'caffeine-logged',
  'cycle-logged',
  'body-metrics-logged',
] as const;

function bandFor(score: number): ReadinessBand {
  if (score >= 82) return 'primed';
  if (score >= 68) return 'ready';
  if (score >= 52) return 'hold';
  return 'caution';
}

function headlineFor(band: ReadinessBand, score: number): string {
  switch (band) {
    case 'primed':
      return `Primed · ${score} — green light for a top-set push`;
    case 'ready':
      return `Ready · ${score} — run the plan as written`;
    case 'hold':
      return `Hold · ${score} — recovered enough, don't chase numbers`;
    case 'caution':
      return `Caution · ${score} — under-recovered, train light and clean`;
    default:
      return 'No recovery signals yet';
  }
}

function loadAdviceFor(band: ReadinessBand): string | null {
  switch (band) {
    case 'primed':
      return 'If the top set moves fast, add 2.5–5%.';
    case 'ready':
      return null;
    case 'hold':
      return 'Hit prescribed reps, skip the AMRAP.';
    case 'caution':
      return 'Back off 5–10%. Quality reps over numbers today.';
    default:
      return null;
  }
}

function normalisePhase(s: string | null): CyclePhase | null {
  if (!s) return null;
  const v = s.toLowerCase();
  if (v.includes('menstr')) return 'menstrual';
  if (v.includes('ovul')) return 'ovulation';
  if (v.includes('follic')) return 'follicular';
  if (v.includes('luteal')) return 'luteal';
  return null;
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function lastObject(rows: readonly unknown[]): Record<string, unknown> | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r && typeof r === 'object') return r as Record<string, unknown>;
  }
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function bool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
