/**
 * Pantry Scanner — localStorage adapters.
 *
 * Everything lives under two keys:
 *   `shippie.pantry-scanner.v1`              — item rows
 *   `shippie.pantry-scanner.consumption.v1`  — bounded ring buffer of events
 *
 * Reads tolerate legacy v0 rows (`location` / `nameKey` missing) by
 * filling defaults — the store is migrate-on-read so a new version
 * doesn't strand the user's data.
 */
import type { ConsumptionEvent, Item, Location } from './types.ts';

export const ITEMS_KEY = 'shippie.pantry-scanner.v1';
export const CONSUMPTION_KEY = 'shippie.pantry-scanner.consumption.v1';

/** Cap on the consumption log. Anything beyond this is dropped FIFO. */
export const CONSUMPTION_LOG_CAP = 500;

export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function migrateItem(raw: unknown): Item | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
  const addedAt =
    typeof r.addedAt === 'string' ? r.addedAt : new Date().toISOString();
  return {
    id: r.id,
    name: r.name,
    nameKey: typeof r.nameKey === 'string' ? r.nameKey : nameKey(r.name),
    barcode: typeof r.barcode === 'string' ? r.barcode : undefined,
    quantity: typeof r.quantity === 'number' ? r.quantity : 1,
    unit: typeof r.unit === 'string' ? r.unit : 'ea',
    expiresOn: typeof r.expiresOn === 'string' ? r.expiresOn : undefined,
    location:
      isLocation(r.location) ? (r.location as Location) : 'pantry',
    notes: typeof r.notes === 'string' ? r.notes : undefined,
    addedAt,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : addedAt,
  };
}

function isLocation(v: unknown): v is Location {
  return (
    v === 'fridge' || v === 'pantry' || v === 'freezer' || v === 'spice-rack'
  );
}

export function loadItems(): Item[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ITEMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(migrateItem)
      .filter((it): it is Item => it !== null);
  } catch {
    return [];
  }
}

export function saveItems(items: readonly Item[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
  } catch {
    // Quota exceeded or storage disabled — surface is non-fatal; the
    // user's next add will retry. We don't throw because every caller
    // is fire-and-forget.
  }
}

export function loadConsumption(): ConsumptionEvent[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CONSUMPTION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ConsumptionEvent =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as ConsumptionEvent).nameKey === 'string' &&
        typeof (e as ConsumptionEvent).at === 'string',
    );
  } catch {
    return [];
  }
}

export function saveConsumption(events: readonly ConsumptionEvent[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const trimmed =
      events.length > CONSUMPTION_LOG_CAP
        ? events.slice(events.length - CONSUMPTION_LOG_CAP)
        : events;
    localStorage.setItem(CONSUMPTION_KEY, JSON.stringify(trimmed));
  } catch {
    // see saveItems comment
  }
}

export function appendConsumption(
  prev: readonly ConsumptionEvent[],
  event: ConsumptionEvent,
): ConsumptionEvent[] {
  const next = [...prev, event];
  if (next.length > CONSUMPTION_LOG_CAP) {
    return next.slice(next.length - CONSUMPTION_LOG_CAP);
  }
  return next;
}
