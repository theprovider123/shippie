/**
 * Open Food Facts barcode lookup. Public, free, no key.
 * Returns just the bits we need to prefill an ingredient row.
 */
export interface ProductLookup {
  barcode: string;
  name: string | null;
  brand: string | null;
  amount: string | null;
  unit: string | null;
  imageUrl: string | null;
}

const ENDPOINT = 'https://world.openfoodfacts.org/api/v0/product';

export async function lookupBarcode(barcode: string, fetchFn: typeof fetch = fetch): Promise<ProductLookup | null> {
  if (!/^[0-9]{6,14}$/.test(barcode)) return null;
  const url = `${ENDPOINT}/${encodeURIComponent(barcode)}.json`;
  let res: Response;
  try {
    res = await fetchFn(url);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as OffResponse | null;
  if (!json || json.status !== 1 || !json.product) return null;
  return parseProduct(barcode, json.product);
}

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

export function parseProduct(barcode: string, p: OffProduct): ProductLookup {
  const name = (p.product_name || p.product_name_en || p.generic_name || '').trim() || null;
  const brand = firstBrand(p.brands);
  const { amount, unit } = parseQuantity(p.quantity);
  return {
    barcode,
    name,
    brand,
    amount,
    unit,
    imageUrl: p.image_front_thumb_url ?? p.image_thumb_url ?? null,
  };
}

export function firstBrand(brands?: string): string | null {
  if (!brands) return null;
  const first = brands.split(',')[0]?.trim();
  return first ? first : null;
}

const QUANTITY_RE = /^(\d+(?:[.,]\d+)?)\s*([a-zA-Zµ]+)?$/;

export function parseQuantity(quantity?: string): { amount: string | null; unit: string | null } {
  if (!quantity) return { amount: null, unit: null };
  const trimmed = quantity.trim();
  const match = QUANTITY_RE.exec(trimmed);
  if (!match) return { amount: trimmed, unit: null };
  const amount = match[1]!.replace(',', '.');
  const unit = (match[2] ?? '').toLowerCase() || null;
  return { amount, unit };
}
