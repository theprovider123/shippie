/**
 * Partner Y.Doc — a small projection of the local DB scoped to whatever
 * fields the user opted to share. Local-DB stays authoritative.
 *
 * Shape (Y.Map at key 'cycle:public:v1'):
 *   {
 *     cycle_day?: number,
 *     fertile_window?: { start: string, end: string },
 *     predicted_period?: { start: string, end: string },
 *     flow_today?: number,            // 0..4
 *     updated_at: number,             // ms epoch
 *     by: 'self' | 'partner',         // who wrote this view
 *   }
 *
 * The partner ALWAYS sees a redacted view: any field not in
 * `partner_seen_fields` is omitted from the projection. Toggling a
 * field off DELETES it from the doc immediately so historical state
 * doesn't linger.
 *
 * Solo-mode invariant: this module is only imported when the user has
 * opted into partner sharing. The toggle is structural — when off, no
 * Y.Doc, no relay, no network.
 */
import * as Y from 'yjs';
import type { PartnerSeenFields } from '../db/schema.ts';

export const PARTNER_MAP_KEY = 'cycle:public:v1';

export interface PartnerView {
  cycle_day?: number;
  fertile_window?: { start: string; end: string };
  predicted_period?: { start: string; end: string };
  flow_today?: number;
  updated_at?: number;
  by?: 'self' | 'partner';
}

export interface PartnerProjection {
  cycle_day?: number;
  fertile_window?: { start: string; end: string };
  predicted_period?: { start: string; end: string };
  flow_today?: number;
}

/**
 * Apply a redacted projection to the partner doc. Any field not in
 * `seen` is removed; any field present in `projection` AND in `seen`
 * is written. The "by: self" marker prevents our own writes from
 * being mistaken for the partner's in the inbound subscriber.
 */
export function publishPartnerView(
  doc: Y.Doc,
  projection: PartnerProjection,
  seen: PartnerSeenFields,
): void {
  const map = doc.getMap<unknown>(PARTNER_MAP_KEY);
  doc.transact(() => {
    if (seen.cycle_day && projection.cycle_day !== undefined) {
      map.set('cycle_day', projection.cycle_day);
    } else {
      map.delete('cycle_day');
    }
    if (seen.fertile_window && projection.fertile_window) {
      map.set('fertile_window', projection.fertile_window);
    } else {
      map.delete('fertile_window');
    }
    if (seen.predicted_period && projection.predicted_period) {
      map.set('predicted_period', projection.predicted_period);
    } else {
      map.delete('predicted_period');
    }
    if (seen.flow_today && projection.flow_today !== undefined) {
      map.set('flow_today', projection.flow_today);
    } else {
      map.delete('flow_today');
    }
    map.set('updated_at', Date.now());
    map.set('by', 'self');
  }, 'self-publish');
}

/** Read whatever the partner published from their phone. */
export function readPartnerView(doc: Y.Doc): PartnerView {
  const map = doc.getMap<unknown>(PARTNER_MAP_KEY);
  return {
    cycle_day: map.get('cycle_day') as number | undefined,
    fertile_window: map.get('fertile_window') as PartnerView['fertile_window'],
    predicted_period: map.get('predicted_period') as PartnerView['predicted_period'],
    flow_today: map.get('flow_today') as number | undefined,
    updated_at: map.get('updated_at') as number | undefined,
    by: map.get('by') as PartnerView['by'],
  };
}
