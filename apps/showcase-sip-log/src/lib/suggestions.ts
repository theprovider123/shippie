/**
 * Smart drink suggestions.
 *
 * The voice rule is: pragmatic, no "wellness journey" language, no
 * scolding. We surface a single suggestion at a time when one applies,
 * and silence ourselves the rest of the time.
 *
 * Triggers (in priority order — first match wins):
 *   1. Morning — coffee logged but no water yet → "glass of water before
 *      your next coffee".
 *   2. Past cutoff — user is about to log a caffeinated drink after the
 *      cutoff hour → "switch to decaf or herbal".  This is exposed
 *      separately as `cutoffWarningFor(kind)` because it's used by the
 *      tap buttons, not the standing suggestion slot.
 *   3. Evening — last 90 minutes of the day, less than 200 ml short of
 *      the hydration goal → "200 ml short of your goal".
 *   4. Hydration target met early — celebrate once, then go quiet.
 */

import type { Sip, SipKind, Targets } from '../db.ts';
import { dayKey } from '../db.ts';

export interface Suggestion {
  id: string;
  text: string;
  /** UI hint — `info` or `warn`. */
  tone: 'info' | 'warn' | 'good';
}

export interface SuggestionInput {
  sips: ReadonlyArray<Sip>;
  targets: Targets;
  now?: Date;
}

export function suggestionFor(input: SuggestionInput): Suggestion | null {
  const now = input.now ?? new Date();
  const day = dayKey(now.toISOString());
  const todays = input.sips.filter((s) => dayKey(s.logged_at) === day);
  const hour = now.getHours();

  let waterMl = 0;
  let caffeineMg = 0;
  let firstCoffeeBeforeWater = false;
  for (const s of todays) {
    if (s.ml > 0 && s.kind === 'water') waterMl += s.ml;
    if (s.mg > 0) caffeineMg += s.mg;
  }
  // Did any caffeinated drink come before any water today?
  const orderedToday = [...todays].sort(
    (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime(),
  );
  const firstNonWater = orderedToday.find((s) => s.mg > 0);
  const firstWater = orderedToday.find((s) => s.kind === 'water');
  if (firstNonWater && (!firstWater || new Date(firstNonWater.logged_at) < new Date(firstWater.logged_at))) {
    firstCoffeeBeforeWater = true;
  }

  // 1. Morning: coffee before water.
  if (hour < 12 && firstCoffeeBeforeWater && waterMl === 0) {
    return {
      id: 'water-before-next-coffee',
      tone: 'info',
      text: 'Glass of water before your next coffee.',
    };
  }

  // 4. Hit the goal already?
  if (waterMl >= input.targets.water_ml) {
    return {
      id: 'goal-met',
      tone: 'good',
      text: `Hit your ${input.targets.water_ml} ml goal. Nice.`,
    };
  }

  // 3. Evening pinch: 21:00+ and within 500 ml of goal.
  const remaining = input.targets.water_ml - waterMl;
  if (hour >= 21 && remaining > 0 && remaining <= 500) {
    return {
      id: 'evening-pinch',
      tone: 'info',
      text: `${remaining} ml short of your hydration goal.`,
    };
  }

  // Mid-afternoon nudge: past cutoff + already over caffeine cap → flag.
  if (hour >= input.targets.caffeine_cutoff_hour && caffeineMg >= input.targets.caffeine_max_mg) {
    return {
      id: 'caffeine-cap-after-cutoff',
      tone: 'warn',
      text: `Past your ${formatHour(input.targets.caffeine_cutoff_hour)} cutoff and at ${caffeineMg} mg caffeine. Watch sleep tonight.`,
    };
  }

  return null;
}

/**
 * Hint shown next to a tap button when tapping it would log caffeine
 * after the cutoff hour. `null` means "no warning, log normally".
 */
export function cutoffWarningFor(
  kind: SipKind,
  targets: Targets,
  now: Date = new Date(),
): string | null {
  if (kind === 'water') return null;
  const hour = now.getHours();
  if (hour < targets.caffeine_cutoff_hour) return null;
  return `After ${formatHour(targets.caffeine_cutoff_hour)} — decaf or herbal sleeps better.`;
}

function formatHour(h: number): string {
  const safe = Math.max(0, Math.min(23, Math.floor(h)));
  return `${String(safe).padStart(2, '0')}:00`;
}
