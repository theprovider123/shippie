/**
 * Cooking method profiles — pure, no React, no DOM. The Cook mode
 * pulls from this when it builds its inputs. Tests read these for
 * confidence that the numbers are sensible.
 *
 * Every method profile says:
 *   - what inputs the user fills in (sous vide wants target temp;
 *     pan wants nothing fancy; smoking wants both)
 *   - what guidance the user sees during the cook ("internal temp at
 *     this point should be...")
 *
 * The numbers come from common home-cook references. Internal temps
 * are the "pull-from-heat" target, not the final-rest temp.
 */
import type { CookMethod } from '../db/schema.ts';

export interface MethodProfile {
  method: CookMethod;
  label: string;
  /** Whether the user enters a target internal temperature. */
  wantsInternalTemp: boolean;
  /** A short hint shown next to the timer. */
  hint: string;
  /** Default suggested internal temp (°C) — where applicable. */
  defaultTempC: number | null;
  /** Cook-time guidance bullets shown above the timer. */
  guidance: string[];
}

export const METHOD_PROFILES: Record<CookMethod, MethodProfile> = {
  'sous-vide': {
    method: 'sous-vide',
    label: 'Sous vide',
    wantsInternalTemp: true,
    defaultTempC: 56,
    hint: 'Hold at temperature. Time is mostly about texture.',
    guidance: [
      'Steak medium-rare: 54-56°C, 1-3h',
      'Pork chop: 60°C, 1-2h',
      'Chicken breast: 63°C, 1.5h',
      'Eggs (soft-set yolk): 63°C, 45m',
    ],
  },
  smoking: {
    method: 'smoking',
    label: 'Smoking',
    wantsInternalTemp: true,
    defaultTempC: 93,
    hint: 'Low and slow. Pull at internal temp, not at clock time.',
    guidance: [
      'Pork shoulder: pull at 92-95°C internal',
      'Brisket: pull at 93-96°C, then rest 1h',
      'Ribs: 90°C internal, "bend test" matters more than thermometer',
      'Smoke chamber: keep at 107-121°C (225-250°F)',
    ],
  },
  roasting: {
    method: 'roasting',
    label: 'Roasting',
    wantsInternalTemp: true,
    defaultTempC: 60,
    hint: 'Set a high oven, watch the internal temp creep up.',
    guidance: [
      'Beef rare: pull at 49-52°C, rests up to 55°C',
      'Beef medium: pull at 57-60°C',
      'Whole chicken: pull at 70-72°C in the breast',
      'Roast veg: 200°C oven, 25-40 min, no thermometer needed',
    ],
  },
  pan: {
    method: 'pan',
    label: 'Pan',
    wantsInternalTemp: false,
    defaultTempC: null,
    hint: 'Hot pan, dry food, salt early. Listen for the sear.',
    guidance: [
      'Sear hot, finish low. Rest meat as long as you cooked it.',
      'Eggs: medium-low. Browning means the pan was too hot.',
      'Veg: don\'t crowd. Steam beats sear when the pan is full.',
      'Fish skin-side first. Press flat for the first 60 seconds.',
    ],
  },
};

export function getMethodProfile(method: CookMethod): MethodProfile {
  return METHOD_PROFILES[method];
}

/**
 * For a method + (optional) current internal temp, return a single-line
 * status string the timer pane shows. Returns empty when there's
 * nothing useful to say (e.g. pan with no probe).
 */
export function describeProgress(
  method: CookMethod,
  internalTempC: number | null,
): string {
  const profile = METHOD_PROFILES[method];
  if (!profile.wantsInternalTemp || internalTempC == null) return '';
  const target = profile.defaultTempC;
  if (target == null) return '';
  const diff = target - internalTempC;
  if (diff > 5) return `Climbing — ${Math.round(diff)}°C from target.`;
  if (diff > 1) return `Almost there — ${Math.round(diff)}°C from target.`;
  if (diff > -1) return `On target. Pull or hold.`;
  return `Past target by ${Math.round(-diff)}°C — rest now.`;
}
