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
 * Photos and OCR text stay in this browser unless the user taps Export
 * (which writes a CSV to the user's Downloads). Model files are fetched
 * as runtime assets and inference runs locally.
 */

const STORAGE_KEY = 'shippie.receipt-snap.v1';

/**
 * Tax scheme tells the export layer whether to populate FreeAgent's
 * `sales_tax_*` fields. Default is `'unknown'` (preserves prior behaviour
 * for rows captured before this widening — the OCR may have detected an
 * amount without classifying the scheme).
 */
export type TaxScheme = 'vat' | 'sales_tax' | 'none' | 'unknown';

/**
 * How the user paid. Optional — the OCR parser may detect it from a card
 * network keyword (VISA / MASTERCARD / CONTACTLESS) or the user picks it
 * in Accounting-mode review.
 */
export type PaymentMethod = 'card' | 'cash' | 'bank_transfer' | 'other';

/**
 * Whether this row has been included in an export run. Flips to
 * `'exported'` after the user runs Export. Resets to `'not_exported'`
 * when a row is edited (so updated receipts don't get silently skipped on
 * the next export). Older rows without this field are treated as
 * `'not_exported'` for safety.
 */
export type ExportStatus = 'not_exported' | 'exported';

export interface Receipt {
  // — Core (unchanged) —
  /** ULID-ish: timestamp + random suffix. Sortable. */
  id: string;
  vendor: string;
  /** Smallest currency unit (cents/pence). null when OCR missed and the user hasn't filled it.
   *  Export layer treats this as the *gross* amount — see `lib/exports/`. */
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

  // — Accounting fields (all optional, post-2026-05-19 widening) —
  /** Accounting supplier override — the stable name the accountant uses.
   *  Falls back to `vendor` at export time when undefined / null. Kept
   *  separate so the OCR'd printed name stays as source-of-truth for
   *  what the receipt actually said. */
  supplier?: string | null;
  /** Pre-tax amount in smallest currency unit. null when not extracted. */
  net_cents?: number | null;
  /** Tax / VAT amount in smallest currency unit. null when not extracted. */
  tax_cents?: number | null;
  /** Tax rate in basis points (e.g. 2000 = 20.00% VAT). null when unknown. */
  tax_rate_bp?: number | null;
  /** Which tax scheme applies. Drives export-layer mapping. */
  tax_scheme?: TaxScheme;
  /** How the receipt was paid. */
  payment_method?: PaymentMethod | null;
  /** Invoice / order / receipt-reference number when present on the receipt. */
  receipt_ref?: string | null;
  /** Free-text project tag, for billing pass-through. */
  project?: string | null;
  /** Free-text client tag. */
  client?: string | null;
  /** Reimbursable expense flag (employee expense vs business cost).
   *  Defaults to `false` at export time when undefined. */
  reimbursable?: boolean;

  // — Bookkeeping flags (all optional) —
  /** Whether this row has been included in an export run. */
  export_status?: ExportStatus;
  /** ISO timestamp when image_data_url was set to null (post-save discard).
   *  Lets the UI say "photo discarded 2 weeks ago" rather than just "no photo". */
  discarded_photo_at?: string | null;
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

/**
 * Normalise a row read from storage so consumers can rely on the optional
 * accounting fields being present (even if just `null` / `'unknown'`).
 * Idempotent: re-normalising a normalised row is a no-op.
 *
 * Does NOT add fields we don't have a useful default for (e.g.
 * `reimbursable` stays `undefined` until the user sets it — defaulting to
 * `false` here would silently flip every legacy row to "non-reimbursable"
 * even on rows where the user didn't make that call).
 */
export function normalise(receipt: Receipt): Receipt {
  return {
    ...receipt,
    supplier: receipt.supplier ?? null,
    net_cents: receipt.net_cents ?? null,
    tax_cents: receipt.tax_cents ?? null,
    tax_rate_bp: receipt.tax_rate_bp ?? null,
    tax_scheme: receipt.tax_scheme ?? 'unknown',
    payment_method: receipt.payment_method ?? null,
    receipt_ref: receipt.receipt_ref ?? null,
    project: receipt.project ?? null,
    client: receipt.client ?? null,
    export_status: receipt.export_status ?? 'not_exported',
    discarded_photo_at: receipt.discarded_photo_at ?? null,
  };
}

/**
 * Resolve the accounting-facing supplier name. Falls back to the printed
 * vendor when the user hasn't set an override. Single helper so every
 * export preset agrees on the rule.
 */
export function effectiveSupplier(receipt: Receipt): string {
  return (receipt.supplier && receipt.supplier.trim()) || receipt.vendor;
}

export function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { receipts: [] };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    const receipts = Array.isArray(parsed.receipts) ? parsed.receipts : [];
    return { receipts: receipts.map(normalise) };
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
    receipts: state.receipts.map((r) => {
      if (r.id !== id) return r;
      const next: Receipt = { ...r, ...patch };
      // Any edit that isn't itself a status update resets export_status so
      // the receipt is included in the next export run. Avoids the "I
      // edited a VAT amount after exporting and it's silently skipped"
      // bug. Explicit status updates (e.g., mark-as-exported by the
      // export action) pass `export_status` in the patch and win.
      const onlyChangedExportStatus =
        Object.keys(patch).length === 1 && 'export_status' in patch;
      if (!onlyChangedExportStatus && next.export_status === 'exported') {
        next.export_status = 'not_exported';
      }
      return next;
    }),
  };
}

/**
 * Discard the photo on a row (privacy / storage discipline). Sets
 * `image_data_url` to null and stamps `discarded_photo_at`. Leaves all
 * other fields intact. Does NOT reset `export_status` — the receipt's
 * accounting fields haven't changed.
 */
export function discardPhoto(state: Persisted, id: string): Persisted {
  const now = new Date().toISOString();
  return {
    receipts: state.receipts.map((r) =>
      r.id === id ? { ...r, image_data_url: null, discarded_photo_at: now } : r,
    ),
  };
}

/**
 * Bulk variant. Used by Settings → "Discard all photos" and by
 * "Export ZIP and discard" after the ZIP download completes.
 */
export function discardAllPhotos(state: Persisted): Persisted {
  const now = new Date().toISOString();
  return {
    receipts: state.receipts.map((r) =>
      r.image_data_url == null
        ? r
        : { ...r, image_data_url: null, discarded_photo_at: now },
    ),
  };
}

/**
 * Flip the listed receipts' `export_status` to `'exported'`. Called by
 * the export-action wiring after a successful download. One pass; no-op
 * for IDs not in state.
 */
export function markExported(state: Persisted, ids: readonly string[]): Persisted {
  const set = new Set(ids);
  return {
    receipts: state.receipts.map((r) =>
      set.has(r.id) ? { ...r, export_status: 'exported' as const } : r,
    ),
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
