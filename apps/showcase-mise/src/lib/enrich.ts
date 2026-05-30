/**
 * Mise — optional online enrichment.
 *
 * OFF by default. With no endpoint configured, `enrichFood` returns null
 * without ever touching the network, so the app is fully offline-canonical
 * out of the box. When a user opts in by setting an endpoint, enrichment
 * only ever *adds* a candidate food (source: 'imported'); it never mutates
 * or replaces the seed DB, and any failure degrades silently to null.
 */
import type { Food, Nutrients } from './foods-data';
import { EMPTY_NUTRIENTS } from './nutrition';

export interface EnrichConfig {
  enabled: boolean;
  /** Search endpoint; receives `?q=` and should return a small JSON result. */
  endpoint?: string;
}

export const DEFAULT_ENRICH: EnrichConfig = { enabled: false };

type FetchLike = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function toFood(raw: unknown): Food | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name ?? r.title ?? r.product_name);
  if (!name) return null;
  const per100: Nutrients = {
    ...EMPTY_NUTRIENTS,
    kcal: num(r.kcal ?? r.calories ?? r.energy),
    protein_g: num(r.protein_g ?? r.protein),
    carb_g: num(r.carb_g ?? r.carbs ?? r.carbohydrate),
    fat_g: num(r.fat_g ?? r.fat),
    fiber_g: num(r.fiber_g ?? r.fiber),
    sodium_mg: num(r.sodium_mg ?? r.sodium),
    caffeine_mg: num(r.caffeine_mg ?? r.caffeine),
  };
  const servingGrams = num(r.serving_grams ?? r.servingGrams) || 100;
  const food: Food = {
    id: `imported_${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    per100,
    serving: { label: str(r.serving_label ?? r.servingLabel) || '100 g', grams: servingGrams },
    category: 'prepared',
    source: 'imported',
  };
  const brand = str(r.brand);
  if (brand) food.brand = brand;
  return food;
}

/**
 * Try to enrich a query into a Food. Returns null when disabled, when no
 * endpoint is set, or on any network/parse failure — callers fall back to
 * the local DB and a custom-food form.
 */
export async function enrichFood(
  query: string,
  config: EnrichConfig = DEFAULT_ENRICH,
  fetchImpl?: FetchLike,
): Promise<Food | null> {
  if (!config.enabled || !config.endpoint || !query.trim()) return null;
  const doFetch = fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (!doFetch) return null;
  try {
    const url = `${config.endpoint}${config.endpoint.includes('?') ? '&' : '?'}q=${encodeURIComponent(query)}`;
    const res = await doFetch(url);
    if (!res.ok) return null;
    const body: unknown = await res.json();
    let candidate: unknown = body;
    if (Array.isArray(body)) {
      candidate = body[0];
    } else if (body && typeof body === 'object') {
      const results = (body as Record<string, unknown>).results;
      if (Array.isArray(results)) candidate = results[0];
    }
    return toFood(candidate);
  } catch {
    return null;
  }
}
