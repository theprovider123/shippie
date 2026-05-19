/**
 * FreeAgent Bank Transactions CSV shape.
 *
 * Reference: dev.freeagent.com/docs/bank_transactions (verified 2026-05-19).
 *
 * Columns (in order):
 *   dated_on, description, amount, fitid, transaction_type
 *
 * - `dated_on`         YYYY-MM-DD
 * - `description`      `<supplier> — <note?>` or just supplier
 * - `amount`           decimal, NEGATIVE for outgoing payments (bank convention)
 * - `fitid`            stable transaction ID — we use the Receipt's `id`
 *                      so re-running the export doesn't duplicate
 *                      transactions on FreeAgent's side (FreeAgent
 *                      deduplicates by date+amount+description by default,
 *                      and a stable fitid is the belt-and-braces guard)
 * - `transaction_type` 'OTHER' — payment-vs-refund is implied by amount sign;
 *                      we let the user adjust at import time if needed
 *
 * Caveat: FreeAgent's docs strongly recommend OFX over CSV for bank
 * imports ("we strongly recommend using OFX"). This preset is CSV
 * because (a) building an OFX file in-browser is non-trivial and the
 * benefit over CSV is small for this use case, and (b) FreeAgent's CSV
 * spec for bank imports is somewhat per-account-type. The user may need
 * to pick the right CSV-format option in FreeAgent's UI. If user
 * feedback shows the CSV path is unreliable, switch to OFX in a
 * follow-up.
 */
import type { Receipt } from '../store.ts';
import { effectiveSupplier } from '../store.ts';
import {
  escapeCsvField,
  formatCentsAsSignedPayment,
  sortNewestFirst,
} from './shared.ts';

export const CSV_HEADER = 'dated_on,description,amount,fitid,transaction_type';

export function receiptToBankRow(r: Receipt): string {
  const date = r.occurred_on ?? r.captured_at.slice(0, 10);
  const supplier = effectiveSupplier(r);
  const description = r.note ? `${supplier} — ${r.note}` : supplier;
  const amount = r.total_cents != null ? formatCentsAsSignedPayment(r.total_cents) : '0.00';
  const fitid = r.id;
  const transactionType = 'OTHER';
  const fields = [date, description, amount, fitid, transactionType].map((f) =>
    escapeCsvField(String(f)),
  );
  return fields.join(',');
}

export function receiptsToBankCsv(receipts: ReadonlyArray<Receipt>): string {
  const lines: string[] = [CSV_HEADER];
  for (const r of sortNewestFirst(receipts)) lines.push(receiptToBankRow(r));
  return `${lines.join('\n')}\n`;
}
