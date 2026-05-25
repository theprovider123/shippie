import type { LngLat, MapExtent } from '../data/parade-2026';
import { getActiveExtent } from './active-extent';

const CELL_M = 10;
const LAT_M = 111_320;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * 10-metre grid code (`A-014`) anchored to the pack's south-west corner.
 * The extent defaults to the currently-active pack so callers don't need
 * to thread it through — round 10's multi-pack support set this up.
 */
export function paradeGridCode(point: LngLat, extent: MapExtent = getActiveExtent()): string {
  const latMeters = (point.lat - extent.south) * LAT_M;
  const lngMeters =
    (point.lng - extent.west) *
    LAT_M *
    Math.cos(((extent.south + extent.north) / 2) * (Math.PI / 180));
  const row = Math.max(0, Math.floor(latMeters / CELL_M));
  const col = Math.max(0, Math.floor(lngMeters / CELL_M));
  return `${letters(row)}-${String(col).padStart(3, '0')}`;
}

function letters(value: number): string {
  const base = LETTERS.length;
  let n = value;
  let out = '';
  do {
    out = LETTERS[n % base] + out;
    n = Math.floor(n / base) - 1;
  } while (n >= 0);
  return out;
}
