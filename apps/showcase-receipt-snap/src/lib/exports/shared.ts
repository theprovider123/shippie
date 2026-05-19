/**
 * Shared helpers for the export presets (csv-accountant, freeagent-
 * expenses-api JSON, freeagent-bank CSV, etc.). Single source of truth
 * for cents-to-string formatting, CSV escaping, attachment filename
 * derivation, and sort order. Avoids each preset reinventing the wheel.
 */
import type { Receipt } from '../store.ts';
import { effectiveSupplier } from '../store.ts';

/** Render an integer-cents value as a 2-decimal string. Honest sign-handling:
 *  negative input → leading '-'. Used by all the export presets so a single
 *  number formatter answers for the whole module. */
export function formatCentsAsDecimal(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}

/** Render an integer-cents value as a *signed* decimal where outgoing
 *  payments are negative. FreeAgent's Expenses API and bank import both
 *  use this convention. Refunds positive, payments negative. */
export function formatCentsAsSignedPayment(cents: number): string {
  // FreeAgent treats payments as negative and refunds as positive.
  // Receipt Snap stores the printed amount on the receipt (positive).
  // Convert to payment-convention by negating, unless the user has
  // explicitly recorded a refund as a negative cents value.
  return formatCentsAsDecimal(-cents);
}

/** Render basis-points → "20.00" / "8.25". Two decimals always. */
export function formatRateBp(bp: number): string {
  return (bp / 100).toFixed(2);
}

/** RFC 4180 CSV field escape. */
export function escapeCsvField(value: string): string {
  if (
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Sort newest-first by `occurred_on`, falling back to `captured_at`. */
export function sortNewestFirst(receipts: ReadonlyArray<Receipt>): Receipt[] {
  return [...receipts].sort((a, b) => {
    const aKey = a.occurred_on ?? a.captured_at ?? '';
    const bKey = b.occurred_on ?? b.captured_at ?? '';
    return bKey.localeCompare(aKey);
  });
}

/** Derive a filesystem-safe filename for a receipt's image attachment. */
export function attachmentFilename(r: Receipt, ext = 'jpg'): string {
  const date = r.occurred_on ?? r.captured_at.slice(0, 10);
  const supplier = effectiveSupplier(r);
  const safeSupplier = supplier
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  const totalDec = r.total_cents != null ? formatCentsAsDecimal(r.total_cents) : 'unknown';
  return `${date}_${safeSupplier || 'receipt'}_${totalDec}.${ext}`;
}

/** Map a Receipt's tax_scheme → FreeAgent's `sales_tax_status` enum.
 *  null when we don't know enough to commit a status — the export caller
 *  can fall back to "TAXABLE" by default. */
export function freeAgentTaxStatus(
  r: Receipt,
): 'TAXABLE' | 'EXEMPT' | 'OUT_OF_SCOPE' | null {
  if (r.tax_scheme === 'none') return 'EXEMPT';
  if (r.tax_scheme === 'vat' || r.tax_scheme === 'sales_tax') return 'TAXABLE';
  // 'unknown' falls through — caller picks the default.
  return null;
}
