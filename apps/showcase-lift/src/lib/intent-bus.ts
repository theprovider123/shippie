/**
 * Intent emission for Lift.
 *
 * Wraps the iframe SDK with typed broadcast helpers so the UI never
 * forgets the payload shape. /today + /glance on the platform host
 * consume these from the IndexedDB intent store.
 */
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import type { Pr, SetRow } from '../db/schema.ts';

const shippie = createShippieIframeSdk({ appId: 'app_lift' });

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
