/**
 * Price tracking — append-only price observations per item, per store.
 *
 * Honest scope: these are user-logged prices, not real-time scrapes.
 * If the user types "£2.40" while ticking off eggs at Tesco, we
 * record that. Next time they shop at Aldi and log £2.10, we can
 * tell them "eggs were £2.40 at Tesco last week, £2.10 at Aldi".
 *
 * We store integers (pence) to dodge floating point, parse loosely
 * from user input ("£2.40", "2.4", "240p" all → 240), and cap the
 * history at MAX_OBSERVATIONS per item to keep state bounded.
 *
 * Comparison surface:
 *   - latestPerStore({ item }) → { tesco: 240, aldi: 210, ... }
 *   - cheapestStore(observations) → { storeId: 'aldi', pence: 210 } | null
 *   - formatPence(240) → "£2.40"
 */
import type { ListItem, PriceObservation } from './types.ts';

const MAX_OBSERVATIONS = 12;

/**
 * Parse a user-typed price string into pence. Tolerates symbols,
 * trailing whitespace, and the British convention of writing 2.4 to
 * mean £2.40 (not £2.04). Returns null on garbage input.
 */
export function parsePence(input: string): number | null {
  const cleaned = input.trim().toLowerCase().replace(/[£$€,\s]/g, '');
  if (!cleaned) return null;
  // Pence-suffixed: "240p" or "240 p"
  const penceMatch = cleaned.match(/^(\d+)p$/);
  if (penceMatch) {
    const v = Number.parseInt(penceMatch[1]!, 10);
    return Number.isFinite(v) ? v : null;
  }
  // Decimal: "2.40", "2.4", ".50"
  const decimalMatch = cleaned.match(/^(\d*)\.(\d{1,2})$/);
  if (decimalMatch) {
    const whole = decimalMatch[1] || '0';
    const frac = decimalMatch[2]!.padEnd(2, '0');
    const v = Number.parseInt(whole + frac, 10);
    return Number.isFinite(v) ? v : null;
  }
  // Pure integer — interpret as pounds (more typical entry).
  const intMatch = cleaned.match(/^\d+$/);
  if (intMatch) {
    const pounds = Number.parseInt(cleaned, 10);
    if (!Number.isFinite(pounds)) return null;
    return pounds * 100;
  }
  return null;
}

/** Format pence as £X.YY for the UI. */
export function formatPence(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(pence);
  const pounds = Math.floor(abs / 100);
  const remainder = (abs % 100).toString().padStart(2, '0');
  return `${sign}£${pounds}.${remainder}`;
}

/**
 * Append a new observation to an item's price history. Bounded by
 * MAX_OBSERVATIONS, oldest dropped first. If the latest observation
 * for that store is identical (same pence, same day), skip — saves
 * us from duplicate-logging when the user hits "save" twice.
 */
export function appendObservation(
  item: ListItem,
  storeId: string,
  pence: number,
  observedAt: string,
): ListItem {
  if (!Number.isFinite(pence) || pence < 0) return item;
  const next: PriceObservation = { storeId, pence, observedAt };
  const existing = item.prices ?? [];
  const lastForStore = [...existing]
    .reverse()
    .find((o) => o.storeId === storeId);
  if (
    lastForStore &&
    lastForStore.pence === pence &&
    lastForStore.observedAt.slice(0, 10) === observedAt.slice(0, 10)
  ) {
    return item;
  }
  const merged = [...existing, next];
  const trimmed =
    merged.length > MAX_OBSERVATIONS
      ? merged.slice(merged.length - MAX_OBSERVATIONS)
      : merged;
  return { ...item, prices: trimmed };
}

/**
 * Latest known pence per store. Returns a fresh object so the caller
 * can iterate / sort without mutating shared state.
 */
export function latestPerStore(
  observations: readonly PriceObservation[] | undefined,
): Record<string, number> {
  if (!observations || observations.length === 0) return {};
  const out: Record<string, { pence: number; at: string }> = {};
  for (const o of observations) {
    const cur = out[o.storeId];
    if (!cur || (o.observedAt || '') > cur.at) {
      out[o.storeId] = { pence: o.pence, at: o.observedAt };
    }
  }
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(out)) result[k] = v.pence;
  return result;
}

/**
 * Find the store with the cheapest latest observation. Returns null
 * if there are no observations.
 */
export function cheapestStore(
  observations: readonly PriceObservation[] | undefined,
): { storeId: string; pence: number } | null {
  const latest = latestPerStore(observations);
  const entries = Object.entries(latest);
  if (entries.length === 0) return null;
  entries.sort((a, b) => a[1] - b[1]);
  const [storeId, pence] = entries[0]!;
  return { storeId, pence };
}

/**
 * Sum the running total of unchecked items at the active store. Items
 * with no price observation for the active store fall back to the
 * cheapest known price (estimate); items with no prices anywhere are
 * skipped from the total but reported in `unknownCount`.
 */
export function runningTotal(
  items: readonly ListItem[],
  activeStoreId: string,
): { totalPence: number; unknownCount: number; estimatedCount: number } {
  let totalPence = 0;
  let unknownCount = 0;
  let estimatedCount = 0;
  for (const item of items) {
    if (item.checked) continue;
    const latest = latestPerStore(item.prices);
    if (latest[activeStoreId] !== undefined) {
      totalPence += latest[activeStoreId]!;
      continue;
    }
    const fallback = cheapestStore(item.prices);
    if (fallback) {
      totalPence += fallback.pence;
      estimatedCount++;
    } else {
      unknownCount++;
    }
  }
  return { totalPence, unknownCount, estimatedCount };
}
