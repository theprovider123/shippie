/**
 * Accountant CSV — wide, human-readable. Includes every accounting field
 * the schema knows about so an accountant or spreadsheet user can see
 * everything in one row.
 *
 * Shape:
 *   date,supplier,vendor,net,tax,tax_rate,tax_scheme,gross,currency,
 *   category,payment_method,reimbursable,project,client,receipt_ref,note
 *
 * Net is left empty when not known. Gross is `total_cents` (which the
 * schema treats as gross at the export layer — see plan revision 2).
 */
import type { Receipt } from '../store.ts';
import { effectiveSupplier } from '../store.ts';
import {
  escapeCsvField,
  formatCentsAsDecimal,
  formatRateBp,
  sortNewestFirst,
} from './shared.ts';

export const CSV_HEADER =
  'date,supplier,vendor,net,tax,tax_rate,tax_scheme,gross,currency,category,payment_method,reimbursable,project,client,receipt_ref,note';

export function receiptToAccountantRow(r: Receipt): string {
  const supplier = effectiveSupplier(r);
  const fields = [
    r.occurred_on ?? '',
    supplier,
    r.vendor ?? '',
    r.net_cents != null ? formatCentsAsDecimal(r.net_cents) : '',
    r.tax_cents != null ? formatCentsAsDecimal(r.tax_cents) : '',
    r.tax_rate_bp != null ? formatRateBp(r.tax_rate_bp) : '',
    r.tax_scheme ?? '',
    r.total_cents != null ? formatCentsAsDecimal(r.total_cents) : '',
    r.currency ?? '',
    r.category ?? '',
    r.payment_method ?? '',
    r.reimbursable === true ? 'true' : r.reimbursable === false ? 'false' : '',
    r.project ?? '',
    r.client ?? '',
    r.receipt_ref ?? '',
    r.note ?? '',
  ].map((f) => escapeCsvField(String(f)));
  return fields.join(',');
}

export function receiptsToAccountantCsv(receipts: ReadonlyArray<Receipt>): string {
  const lines: string[] = [CSV_HEADER];
  for (const r of sortNewestFirst(receipts)) lines.push(receiptToAccountantRow(r));
  return `${lines.join('\n')}\n`;
}
