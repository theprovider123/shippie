/**
 * Active pack extent — the bounding box currently in use.
 *
 * Round 10 introduced multi-pack support (Arsenal / Amsterdam / Watford).
 * Validators in `fan-events.ts`, `group-plan.ts`, and `parade-grid.ts` were
 * previously hard-coded to the Islington `CORRIDOR_EXTENT`. They now read
 * from this module instead — `App.tsx` sets the active extent the moment
 * the route pack loads, and every downstream validator stays consistent.
 *
 * Single global mutable, intentionally. A SPA loads one pack at a time;
 * threading the pack through every validator caller would be noisier than
 * this small concession.
 */

import { CORRIDOR_EXTENT, type MapExtent } from '../data/parade-2026';

let active: MapExtent = CORRIDOR_EXTENT;

export function getActiveExtent(): MapExtent {
  return active;
}

export function setActiveExtent(extent: MapExtent): void {
  active = extent;
}
