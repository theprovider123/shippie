/**
 * Multi-stage timeline. Real bread is a sequence of stages:
 *
 *   feed-starter → levain-build → autolyse → mix → bulk-ferment
 *   (with stretch-and-folds at intervals) → divide → preshape →
 *   bench-rest → final-shape → cold-retard → bake → cool
 *
 * For commercial-yeast loaves the levain-build is replaced by a
 * shorter bulk and there's no cold retard by default.
 *
 * This module:
 *   - Models stages with optional repeating sub-prompts (e.g. "S&F #1
 *     at +30m, #2 at +60m"...)
 *   - Plans an absolute schedule by anchoring to either a target
 *     start or a target ready time (working backwards).
 *   - Computes a "now indicator" — the offset along the timeline at
 *     a given wall-clock instant.
 *   - Emits notification points (offset + label + body) the UI can
 *     subscribe to.
 *
 * Time unit throughout this module: minutes (integers). Wall-clock
 * times are JS Date.
 */

import type { LeavenKind } from './percentages.ts';

export type StageKind =
  | 'feed-starter'
  | 'levain-build'
  | 'autolyse'
  | 'mix'
  | 'bulk-ferment'
  | 'divide'
  | 'preshape'
  | 'bench-rest'
  | 'final-shape'
  | 'cold-retard'
  | 'final-proof'
  | 'bake'
  | 'cool';

export interface SubPrompt {
  /** Minutes from the *start of this stage*. */
  offsetMin: number;
  label: string;
  body: string;
}

export interface Stage {
  kind: StageKind;
  /** Display label, e.g. "Bulk ferment". */
  label: string;
  /** Total minutes this stage takes. */
  minutes: number;
  /** Long-form what-to-do shown when a stage is tapped. */
  prompt: string;
  /** Optional repeating sub-prompts (S&F times, etc.). */
  subPrompts?: ReadonlyArray<SubPrompt>;
}

export interface ScheduledStage extends Stage {
  startAt: Date;
  endAt: Date;
  /** Offset from schedule start in minutes. */
  startOffset: number;
  /** Cumulative offset where this stage *ends*. */
  endOffset: number;
}

export interface ScheduledSubPrompt extends SubPrompt {
  fireAt: Date;
  /** Offset from the *whole schedule's* start, not the stage's. */
  totalOffsetMin: number;
  stageKind: StageKind;
}

export interface PlannedSchedule {
  startAt: Date;
  readyAt: Date;
  totalMinutes: number;
  stages: ReadonlyArray<ScheduledStage>;
  subPrompts: ReadonlyArray<ScheduledSubPrompt>;
}

/**
 * Build a default stage list from a leaven kind + flags. The caller
 * can override individual stage minutes downstream.
 *
 * Sourdough (with `useColdRetard`):
 *   feed-starter → levain-build → autolyse → mix → bulk (S&F at 30/60/90/120)
 *   → preshape → bench-rest → final-shape → cold-retard → bake → cool
 *
 * Yeast (commercial yeast or poolish):
 *   (poolish-build if poolish) → mix → bulk → divide → preshape
 *   → bench-rest → final-shape → final-proof → bake → cool
 *
 * Numbers are sane defaults — recipes override.
 */
export interface DefaultStagesOpts {
  leaven: LeavenKind;
  /** Use a cold retard? Default: true for sourdough, false for yeast. */
  useColdRetard?: boolean;
  /** Hours of bulk fermentation. Default: 4 for sourdough, 1.5 for yeast. */
  bulkHours?: number;
  /** Minutes of cold retard. Default: 12h for sourdough. */
  coldRetardMinutes?: number;
  /** Minutes of pre-ferment build (levain or poolish). Default: 5h levain, 12h poolish. */
  preFermentMinutes?: number;
  /** Bake length in minutes. Default: 45 for crusty loaves. */
  bakeMinutes?: number;
}

export function defaultStages(opts: DefaultStagesOpts): Stage[] {
  const {
    leaven,
    useColdRetard = leaven === 'sourdough',
    bulkHours = leaven === 'sourdough' ? 4 : 1.5,
    coldRetardMinutes = 12 * 60,
    preFermentMinutes = leaven === 'poolish' ? 12 * 60 : 5 * 60,
    bakeMinutes = 45,
  } = opts;

  const stages: Stage[] = [];

  if (leaven === 'sourdough') {
    stages.push({
      kind: 'feed-starter',
      label: 'Feed your starter',
      minutes: 0, // gate — happens before the timeline starts
      prompt:
        'Refresh your starter at a 1:5:5 ratio (10g starter : 50g water : 50g flour) and let it peak before building the levain. Skip if your starter is already ripe.',
    });
    stages.push({
      kind: 'levain-build',
      label: 'Levain build',
      minutes: preFermentMinutes,
      prompt:
        'Build the levain off the ripe starter. It is ready when it has roughly doubled and floats in water. Warmer kitchens peak faster.',
    });
  } else if (leaven === 'poolish') {
    stages.push({
      kind: 'levain-build',
      label: 'Poolish build',
      minutes: preFermentMinutes,
      prompt:
        '100% hydration pre-ferment, equal parts flour and water plus a pinch of yeast. Ready when domed with a craquelure on top — typically 12–16 hours at room temp.',
    });
  }

  stages.push({
    kind: 'autolyse',
    label: 'Autolyse',
    minutes: leaven === 'sourdough' ? 60 : 20,
    prompt:
      'Mix flour and water until just hydrated (no dry pockets). Cover and rest. Hydration improves, gluten begins on its own, and the final mix is shorter.',
  });

  stages.push({
    kind: 'mix',
    label: 'Mix in salt + leaven',
    minutes: 10,
    prompt:
      'Add the leaven and salt to the autolysed dough. Pinch and fold until fully incorporated. Aim for a smooth, cohesive mass.',
  });

  // Bulk + S&F
  const bulkMin = Math.round(bulkHours * 60);
  const subPrompts: SubPrompt[] = [];
  if (leaven === 'sourdough') {
    // S&F at +30, +60, +90, +120
    for (let i = 1; i <= 4; i++) {
      subPrompts.push({
        offsetMin: i * 30,
        label: `Stretch & fold #${i}`,
        body:
          i === 1
            ? 'Wet hands. Lift one side of the dough, stretch up, fold across to the other side. Rotate the bowl 90° and repeat for all four sides.'
            : 'Continue the stretch-and-fold cycle. The dough should feel stronger and smoother each round.',
      });
    }
  } else {
    // Yeast bulk: one fold at +30 if bulk is long enough
    if (bulkMin >= 60) {
      subPrompts.push({
        offsetMin: 30,
        label: 'Single fold',
        body: 'Stretch and fold once to build a touch of structure.',
      });
    }
  }
  stages.push({
    kind: 'bulk-ferment',
    label: 'Bulk ferment',
    minutes: bulkMin,
    prompt:
      leaven === 'sourdough'
        ? 'The main rise. Look for ~50% volume increase, a domed top, and visible bubbles along the sides of the bowl. Stretch-and-folds build strength along the way.'
        : 'A short, strong rise. Aim for the dough to nearly double, then move on to shaping.',
    subPrompts,
  });

  stages.push({
    kind: 'divide',
    label: 'Divide',
    minutes: 5,
    prompt:
      'Tip the dough out, divide to your target weights with a bench knife. Try not to deflate it.',
  });

  stages.push({
    kind: 'preshape',
    label: 'Pre-shape',
    minutes: 5,
    prompt:
      'Loose round each piece — the seam pulled to the bottom, the top tightened. Just enough tension to hold a shape.',
  });

  stages.push({
    kind: 'bench-rest',
    label: 'Bench rest',
    minutes: 25,
    prompt:
      'Cover and let the pre-shaped pieces relax. The gluten loosens so the final shape goes on without tearing.',
  });

  stages.push({
    kind: 'final-shape',
    label: 'Final shape',
    minutes: 10,
    prompt:
      'Shape into a boule or bâtard. Seam-side-up into a floured banneton or couche.',
  });

  if (useColdRetard) {
    stages.push({
      kind: 'cold-retard',
      label: 'Cold retard',
      minutes: coldRetardMinutes,
      prompt:
        'Into the fridge, covered. Slow ferment builds flavour and firms the dough so you can score cleanly straight from cold.',
    });
  } else {
    stages.push({
      kind: 'final-proof',
      label: 'Final proof',
      minutes: 60,
      prompt:
        'Final rise at room temp. Ready when a gentle poke springs back slowly and only partway.',
    });
  }

  stages.push({
    kind: 'bake',
    label: 'Bake',
    minutes: bakeMinutes,
    prompt:
      'Score and load. For boules: lid on for 20m at 245°C, lid off another 20–25m at 225°C until deep mahogany. Internal temp ≥ 96°C.',
  });

  stages.push({
    kind: 'cool',
    label: 'Cool',
    minutes: 90,
    prompt:
      'Onto a rack. Wait at least 60 minutes — slicing hot bread leaves a gummy crumb. The loaf finishes cooking while it cools.',
  });

  return stages;
}

/** Sum minutes across all stages. */
export function totalMinutes(stages: ReadonlyArray<Stage>): number {
  return stages.reduce((sum, s) => sum + s.minutes, 0);
}

/** Plan with an explicit start time. */
export function planFromStart(
  stages: ReadonlyArray<Stage>,
  startAt: Date,
): PlannedSchedule {
  const total = totalMinutes(stages);
  const out: ScheduledStage[] = [];
  const subs: ScheduledSubPrompt[] = [];
  let cursor = startAt.getTime();
  let offset = 0;
  for (const s of stages) {
    const stageStart = new Date(cursor);
    const stageEnd = new Date(cursor + s.minutes * 60_000);
    out.push({
      ...s,
      startAt: stageStart,
      endAt: stageEnd,
      startOffset: offset,
      endOffset: offset + s.minutes,
    });
    if (s.subPrompts) {
      for (const sp of s.subPrompts) {
        subs.push({
          ...sp,
          fireAt: new Date(cursor + sp.offsetMin * 60_000),
          totalOffsetMin: offset + sp.offsetMin,
          stageKind: s.kind,
        });
      }
    }
    cursor = stageEnd.getTime();
    offset += s.minutes;
  }
  return {
    startAt,
    readyAt: new Date(startAt.getTime() + total * 60_000),
    totalMinutes: total,
    stages: out,
    subPrompts: subs,
  };
}

/** Plan working backwards from a target ready time. */
export function planFromReady(
  stages: ReadonlyArray<Stage>,
  readyAt: Date,
): PlannedSchedule {
  const total = totalMinutes(stages);
  const startAt = new Date(readyAt.getTime() - total * 60_000);
  return planFromStart(stages, startAt);
}

export interface NowPosition {
  /** Index of the stage we're currently inside. -1 if before start, stages.length if after end. */
  stageIndex: number;
  /** 0..1 progress through the current stage. */
  stageProgress: number;
  /** Minutes elapsed since schedule start (negative if before start). */
  elapsedMin: number;
  /** Minutes until ready (negative if past ready). */
  remainingMin: number;
  /** 0..1 progress along the whole schedule. */
  totalProgress: number;
}

/**
 * Compute where `now` sits along a planned schedule.
 */
export function positionOnSchedule(plan: PlannedSchedule, now: Date): NowPosition {
  const elapsed = (now.getTime() - plan.startAt.getTime()) / 60_000;
  const remaining = (plan.readyAt.getTime() - now.getTime()) / 60_000;
  if (elapsed < 0) {
    return {
      stageIndex: -1,
      stageProgress: 0,
      elapsedMin: elapsed,
      remainingMin: remaining,
      totalProgress: 0,
    };
  }
  if (elapsed >= plan.totalMinutes) {
    return {
      stageIndex: plan.stages.length,
      stageProgress: 1,
      elapsedMin: elapsed,
      remainingMin: remaining,
      totalProgress: 1,
    };
  }
  let acc = 0;
  for (let i = 0; i < plan.stages.length; i++) {
    const s = plan.stages[i]!;
    if (elapsed < acc + s.minutes) {
      const into = elapsed - acc;
      return {
        stageIndex: i,
        stageProgress: s.minutes > 0 ? into / s.minutes : 1,
        elapsedMin: elapsed,
        remainingMin: remaining,
        totalProgress: elapsed / plan.totalMinutes,
      };
    }
    acc += s.minutes;
  }
  // Shouldn't reach here given the first guard, but be defensive.
  return {
    stageIndex: plan.stages.length - 1,
    stageProgress: 1,
    elapsedMin: elapsed,
    remainingMin: remaining,
    totalProgress: 1,
  };
}

export function formatHM(minutes: number): string {
  const m = Math.round(minutes);
  if (m === 0) return '0m';
  const sign = m < 0 ? '-' : '';
  const abs = Math.abs(m);
  if (abs < 60) return `${sign}${abs}m`;
  const h = Math.floor(abs / 60);
  const r = abs % 60;
  return r === 0 ? `${sign}${h}h` : `${sign}${h}h ${r}m`;
}

export function formatClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDayClock(d: Date): string {
  return d.toLocaleString([], {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
