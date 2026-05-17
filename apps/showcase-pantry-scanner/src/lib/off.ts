/**
 * Open Food Facts enrichment with offline cache.
 *
 * The barcode scan path runs:
 *   1. Local catalogue (`barcode.ts#lookupByBarcode`) — fast, deterministic.
 *   2. OFF cache in localStorage — offline-friendly after first hit.
 *   3. Live OFF API — when online and the user has tapped "Look up".
 *
 * Cache shape is intentionally narrow: the fields a maker actually
 * needs to seed an item row. Image URLs are stored as-is — the OFF
 * CDN is public so we link, not proxy.
 */

const CACHE_KEY = 'shippie.pantry-scanner.off-cache.v1';
const CACHE_CAP = 200;
const ENDPOINT = 'https://world.openfoodfacts.org/api/v0/product';

export interface OffCachedProduct {
  barcode: string;
  name: string | null;
  brand: string | null;
  amount: string | null;
  unit: string | null;
  imageUrl: string | null;
  fetchedAt: string;
}

export type FetchLike = (input: string) => Promise<Response>;

interface OffProduct {
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string;
  quantity?: string;
  image_thumb_url?: string;
  image_front_thumb_url?: string;
}

interface OffResponse {
  status?: number;
  product?: OffProduct;
}

function loadCache(): Record<string, OffCachedProduct> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, OffCachedProduct>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    // FIFO trim if oversized (most-recently-cached survive).
    const entries = Object.entries(cache);
    if (entries.length > CACHE_CAP) {
      entries.sort(
        (a, b) =>
          Date.parse(b[1].fetchedAt) - Date.parse(a[1].fetchedAt),
      );
      const trimmed: Record<string, OffCachedProduct> = {};
      for (const [k, v] of entries.slice(0, CACHE_CAP)) trimmed[k] = v;
      localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    }
  } catch {
    // see saveItems comment
  }
}

export function readCached(barcode: string): OffCachedProduct | null {
  const cache = loadCache();
  return cache[barcode] ?? null;
}

export async function lookupAndCache(
  barcode: string,
  fetchFn: FetchLike = (url) => fetch(url),
): Promise<OffCachedProduct | null> {
  if (!/^[0-9]{6,14}$/.test(barcode)) return null;
  const url = `${ENDPOINT}/${encodeURIComponent(barcode)}.json`;
  let res: Response;
  try {
    res = await fetchFn(url);
  } catch {
    return readCached(barcode);
  }
  if (!res.ok) return readCached(barcode);
  const json = (await res.json().catch(() => null)) as OffResponse | null;
  if (!json || json.status !== 1 || !json.product) return readCached(barcode);

  const product = parseProduct(barcode, json.product);
  const cache = loadCache();
  cache[barcode] = product;
  saveCache(cache);
  return product;
}

export function parseProduct(
  barcode: string,
  p: OffProduct,
): OffCachedProduct {
  const name =
    (p.product_name || p.product_name_en || p.generic_name || '').trim() ||
    null;
  const brand = firstBrand(p.brands);
  const { amount, unit } = parseQuantity(p.quantity);
  return {
    barcode,
    name,
    brand,
    amount,
    unit,
    imageUrl: p.image_front_thumb_url ?? p.image_thumb_url ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

export function firstBrand(brands?: string): string | null {
  if (!brands) return null;
  const first = brands.split(',')[0]?.trim();
  return first ? first : null;
}

const QUANTITY_RE = /^(\d+(?:[.,]\d+)?)\s*([a-zA-Zµ]+)?$/;

export function parseQuantity(quantity?: string): {
  amount: string | null;
  unit: string | null;
} {
  if (!quantity) return { amount: null, unit: null };
  const trimmed = quantity.trim();
  const match = QUANTITY_RE.exec(trimmed);
  if (!match) return { amount: trimmed, unit: null };
  const amount = match[1]!.replace(',', '.');
  const unit = (match[2] ?? '').toLowerCase() || null;
  return { amount, unit };
}
