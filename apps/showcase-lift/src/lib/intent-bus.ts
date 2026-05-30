/**
 * Intent emission for Lift.
 *
 * Wraps the iframe SDK with typed broadcast helpers so the UI never
 * forgets the payload shape. /today + /glance on the platform host
 * consume these from the IndexedDB intent store.
 */
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import type { Pr, SetRow } from '../db/schema.ts';
import { CONSUMED_INTENTS } from '../utils/readiness.ts';
import type { TrainingLoad } from '../utils/training-load.ts';

const shippie = createShippieIframeSdk({ appId: 'app_lift' });

export function emitWorkoutStarted(input: {
  workoutId: string;
  source: string;
  templateId?: string | null;
  exerciseCount: number;
  startedAt: string;
}): void {
  shippie.intent.broadcast('workout-started', [input]);
}

export function emitSetLogged(set: SetRow, exerciseName: string): void {
  shippie.intent.broadcast('set-logged', [
    {
      exercise: exerciseName,
      weight: set.weight,
      reps: set.reps,
      unit: set.unit,
      set_type: set.set_type,
      logged_at: set.completed_at,
    },
  ]);
}

export function emitWorkoutCompleted(input: {
  exerciseCount: number;
  setCount: number;
  totalTonnage: number;
  durationMinutes: number;
  startedAt: string;
  completedAt: string;
}): void {
  shippie.intent.broadcast('workout-completed', [input]);
}

export function emitPrBroken(pr: Pr, exerciseName: string): void {
  shippie.intent.broadcast('pr-broken', [
    {
      exercise: exerciseName,
      kind: pr.kind,
      weight: pr.weight,
      reps: pr.reps,
      rep_range: pr.rep_range,
      achieved_at: pr.achieved_at,
    },
  ]);
}

export function emitDeloadRecommended(reason: string): void {
  shippie.intent.broadcast('deload-recommended', [
    {
      reason,
      observed_at: new Date().toISOString(),
    },
  ]);
}

export function emitTrainingLoadUpdated(load: TrainingLoad): void {
  shippie.intent.broadcast('training-load-updated', [
    {
      session_tonnage: load.sessionTonnage,
      session_load: load.sessionLoad,
      acute_tonnage: load.acuteTonnage,
      chronic_weekly_tonnage: load.chronicWeeklyTonnage,
      acwr: load.acwr,
      band: load.band,
      recommend_deload: load.recommendDeload,
      computed_at: new Date().toISOString(),
    },
  ]);
}

/**
 * Wire up consumption of the inbound readiness intents. Requests
 * one-time consume permission for each, then subscribes. `handler`
 * receives the raw (intent, rows) so the store can run the matcher.
 * Returns a single unsubscribe that detaches every listener.
 */
export function subscribeReadinessSignals(
  handler: (intent: string, rows: readonly unknown[]) => void,
): () => void {
  const offs: Array<() => void> = [];
  for (const intent of CONSUMED_INTENTS) {
    shippie.requestIntent(intent);
    offs.push(shippie.intent.subscribe(intent, ({ intent: i, rows }) => handler(i, rows)));
  }
  return () => {
    for (const off of offs) off();
  };
}
