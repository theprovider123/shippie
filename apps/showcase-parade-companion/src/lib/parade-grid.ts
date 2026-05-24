import { CORRIDOR_EXTENT, type LngLat } from '../data/parade-2026';

const CELL_M = 10;
const LAT_M = 111_320;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function paradeGridCode(point: LngLat): string {
  const latMeters = (point.lat - CORRIDOR_EXTENT.south) * LAT_M;
  const lngMeters =
    (point.lng - CORRIDOR_EXTENT.west) *
    LAT_M *
    Math.cos(((CORRIDOR_EXTENT.south + CORRIDOR_EXTENT.north) / 2) * (Math.PI / 180));
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
