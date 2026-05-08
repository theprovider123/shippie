/**
 * Receipt persistence — localStorage-backed for metadata, with image
 * data URLs inlined per row.
 *
 * Why localStorage and not OPFS / IndexedDB:
 *   - Receipt count per phone tops out in the low hundreds even for
 *     heavy users; quota pressure isn't real.
 *   - The whole row including the image data URL fits comfortably in
 *     localStorage at ~5 MB total budget when images are downscaled
 *     to <500 KB each (the capture surface enforces this — see
 *     CaptureSurface.tsx).
 *   - Simpler to reason about + test than wa-sqlite + OPFS for a
 *     single-table single-user app.
 *
 * Photos never leave the device. The model never leaves the device.
 * The OCR'd text never leaves the device unless the user taps Export
 * (which writes a CSV to the user's Downloads).
 */

const STORAGE_KEY = 'shippie.receipt-snap.v1';

export interface Receipt {
  /** ULID-ish: timestamp + random suffix. Sortable. */
  id: string;
  vendor: string;
  /** Smallest currency unit (cents/pence). null when OCR missed and the user hasn't filled it. */
  total_cents: number | null;
  /** ISO 4217 code, e.g. "USD", "GBP". Defaults to 'USD' if undetected. */
  currency: string;
  /** "food", "coffee", "restaurant", "transport", "supplies", "other". User-editable. */
  category: string;
  /** Date printed on the receipt (YYYY-MM-DD). null when undetected. */
  occurred_on: string | null;
  /** When the user captured the photo. Always set. */
  captured_at: string;
  /** Raw OCR output — kept for re-parsing if heuristics improve later. */
  raw_ocr_text: string;
  /** Compressed JPEG/PNG data URL of the photo. null if the user discarded it after save. */
  image_data_url: string | null;
  /** User free-text note. Optional. */
  note: string;
}

interface Persisted {
  receipts: Receipt[];
}

export const CATEGORIES = [
  'food',
  'coffee',
  'restaurant',
  'groceries',
  'transport',
  'supplies',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export function newId(): string {
  return `rcpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { receipts: [] };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [],
    };
  } catch {
    return { receipts: [] };
  }
}

export function save(state: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* best-effort — quota errors fail silently, the user will notice on next save */
  }
}

export function insert(state: Persisted, receipt: Receipt): Persisted {
  return { receipts: [receipt, ...state.receipts].slice(0, 1000) };
}

export function remove(state: Persisted, id: string): Persisted {
  return { receipts: state.receipts.filter((r) => r.id !== id) };
}

export function update(state: Persisted, id: string, patch: Partial<Receipt>): Persisted {
  return {
    receipts: state.receipts.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  };
}

export function clearAll(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Estimate the storage footprint in bytes (rough — JSON.stringify overhead). */
export function estimateBytes(state: Persisted): number {
  try {
    return new Blob([JSON.stringify(state)]).size;
  } catch {
    return 0;
  }
}
