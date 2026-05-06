/**
 * Cook-time helpers — adjustments + stage-prompt scheduling.
 *
 * The headline calculation lives in `data.ts::computeCookMinutes`. This
 * module layers situational adjustments on top: bath drift for sous vide,
 * staged prompts for smoking/roasting timers.
 */

import type { Cut, Method } from '../data.ts';

/**
 * Sous-vide bath drift. If the user reports the actual bath temp differs
 * from the target, they need to extend (or trim) cook time. The relation
 * is non-linear in reality, but for a few-degree drift the linear
 * approximation works well enough.
 *
 * Rule of thumb (ChefSteps): per 1°C below target, add ~10% to cook time
 * (bounded — past 3°C drift, the bath is broken and pasteurisation
 * assumptions stop holding).
 *
 * @param base_minutes The recipe time at target.
 * @param drift_c Negative if the bath is below target, positive if above.
 *   e.g. target 60°C, bath 58°C → drift_c = -2.
 * @returns Adjusted minutes. Negative drift extends; positive returns base
 *   (you cannot shorten safely past the recipe — pasteurisation needs time).
 */
export function adjustForBathDrift(base_minutes: number, drift_c: number): number {
  if (drift_c >= 0) return base_minutes;
  if (drift_c < -3) {
    // Don't pretend a broken bath is recoverable with arithmetic.
    return base_minutes; // signal to UI: drift too large to trust
  }
  const factor = 1 + Math.abs(drift_c) * 0.1;
  return Math.round(base_minutes * factor);
}

/** Did the bath drift past the safe-to-extend threshold? */
export function bathDriftIsCritical(drift_c: number): boolean {
  return drift_c < -3;
}

// ─────────────────────────────────────────────────────────────
// Stage prompts — the per-method timer surfaces these as the cook
// progresses. The smoker gets the most ("wrap or ride?"); pan
// timers are minimalist ("flip", "rest").
// ─────────────────────────────────────────────────────────────

export interface StagePrompt {
  /** Minutes from start when this prompt fires. */
  at_minute: number;
  /** Short label shown in the timer banner. */
  title: string;
  /** Plain-language guidance for the prompt. */
  body: string;
}

/**
 * Build the stage-prompt schedule for a cook. Prompts are absolute
 * minute offsets from start.
 */
export function buildStagePrompts(
  cut: Cut,
  method: Method,
  cook_minutes: number,
  rest_minutes: number,
): ReadonlyArray<StagePrompt> {
  const prompts: StagePrompt[] = [];

  if (method === 'smoke') {
    // The 3-2-1 ribs case has a fixed 360 min cook — surface stage
    // markers at the wrap and sauce milestones.
    if (cut.id === 'pork-ribs' && cook_minutes >= 360) {
      prompts.push({
        at_minute: 180,
        title: 'Wrap',
        body: 'Wrap ribs in foil with apple juice. Back on the smoker.',
      });
      prompts.push({
        at_minute: 300,
        title: 'Sauce',
        body: 'Unwrap, brush sauce, last hour to set.',
      });
    } else {
      // Generic large-cut smoke: stall window check, mid-cook probe, pull warning.
      const stall_at = Math.round(cook_minutes * 0.35);
      const probe_at = Math.round(cook_minutes * 0.7);
      const pull_warn_at = Math.max(cook_minutes - 30, Math.round(cook_minutes * 0.9));
      prompts.push({
        at_minute: stall_at,
        title: 'Stall window',
        body:
          'Internal should be approaching the stall (~70°C). If wrapping, butcher paper or foil now. If riding, expect another 1–2h plateau.',
      });
      prompts.push({
        at_minute: probe_at,
        title: 'Probe check',
        body:
          'Probe should slide in like soft butter. If it resists, give it another 30–60 min — temperature lies, probe-feel does not.',
      });
      prompts.push({
        at_minute: pull_warn_at,
        title: 'Pull soon',
        body: 'Approaching pull temp. Get the cooler / vented foil ready for the long rest.',
      });
    }
  }

  if (method === 'roast') {
    // Mid-roast baste check (only useful for cuts with weight).
    if (cook_minutes >= 60) {
      prompts.push({
        at_minute: Math.round(cook_minutes * 0.5),
        title: 'Baste / rotate',
        body: 'Halfway. Baste with rendered fat or rotate the pan for even browning.',
      });
    }
    if (rest_minutes > 0) {
      prompts.push({
        at_minute: cook_minutes,
        title: 'Pull and rest',
        body: `Pull from oven now. Rest ${rest_minutes} min loosely tented — centre will rise from carryover.`,
      });
    }
  }

  if (method === 'grill' || method === 'pan') {
    // Per-side timing handled by the stub — no need for many prompts.
    if (cook_minutes >= 4) {
      prompts.push({
        at_minute: Math.round(cook_minutes / 2),
        title: 'Flip',
        body: 'Flip now. Resist the urge to peek before — Maillard needs uninterrupted contact.',
      });
    }
    if (rest_minutes > 0) {
      prompts.push({
        at_minute: cook_minutes,
        title: 'Rest',
        body: `Off the heat. Rest ${rest_minutes} min before slicing.`,
      });
    }
  }

  if (method === 'sous-vide') {
    // No mid-cook prompts — the whole point is hands-off — but a
    // sear reminder at the end is useful.
    prompts.push({
      at_minute: cook_minutes,
      title: 'Sear and serve',
      body: 'Pull from bag, pat bone-dry, sear hot in a heavy pan or torch — colour, not cooking.',
    });
  }

  return prompts.sort((a, b) => a.at_minute - b.at_minute);
}

/**
 * Find the next prompt that hasn't fired yet.
 *
 * @param prompts Schedule built by `buildStagePrompts`.
 * @param elapsed_minutes Minutes since cook started.
 * @returns The next prompt, or null if all have passed.
 */
export function nextStagePrompt(
  prompts: ReadonlyArray<StagePrompt>,
  elapsed_minutes: number,
): StagePrompt | null {
  return prompts.find((p) => p.at_minute > elapsed_minutes) ?? null;
}

/** Find the most recently triggered prompt (≤ elapsed). */
export function currentStagePrompt(
  prompts: ReadonlyArray<StagePrompt>,
  elapsed_minutes: number,
): StagePrompt | null {
  let result: StagePrompt | null = null;
  for (const p of prompts) {
    if (p.at_minute <= elapsed_minutes) result = p;
    else break;
  }
  return result;
}
