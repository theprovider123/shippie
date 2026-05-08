/**
 * CSV serialiser for the export button.
 *
 * Shape: date,vendor,total,currency,category,note
 *
 * Rules:
 *   - Always include the header row, even on empty data, so importers
 *     don't break.
 *   - Quote any field containing a comma, double-quote, or newline.
 *   - Escape embedded quotes by doubling them (RFC 4180).
 *   - Total is rendered with two decimals (1234 cents → "12.34"), the
 *     same way the UI shows it; ledger consumers re-multiply if they
 *     need integer cents.
 */

import type { Receipt } from './store.ts';

export const CSV_HEADER = 'date,vendor,total,currency,category,note';

export function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function centsToString(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}

export function receiptToCsvRow(r: Receipt): string {
  const fields = [
    r.occurred_on ?? '',
    r.vendor ?? '',
    r.total_cents != null ? centsToString(r.total_cents) : '',
    r.currency ?? '',
    r.category ?? '',
    r.note ?? '',
  ].map((f) => escapeCsvField(String(f)));
  return fields.join(',');
}

export function receiptsToCsv(receipts: ReadonlyArray<Receipt>): string {
  const lines: string[] = [CSV_HEADER];
  // Sort newest-first by occurred_on, falling back to captured_at.
  const sorted = [...receipts].sort((a, b) => {
    const aKey = a.occurred_on ?? a.captured_at ?? '';
    const bKey = b.occurred_on ?? b.captured_at ?? '';
    return bKey.localeCompare(aKey);
  });
  for (const r of sorted) lines.push(receiptToCsvRow(r));
  // Trailing newline so editors don't show "no newline at EOF".
  return `${lines.join('\n')}\n`;
}
