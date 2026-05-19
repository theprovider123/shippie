/**
 * FreeAgent Expenses API JSON shape.
 *
 * Reference: dev.freeagent.com/docs/expenses (verified 2026-05-19).
 *
 * The Expenses API is JSON-only — there is NO CSV import for expenses.
 * This preset emits an array of `expense` objects mapped to the FreeAgent
 * fields. The user (or a thin upload script) provides the `user` and
 * `category` URIs at import time — Receipt Snap doesn't know which
 * FreeAgent user / category to point at, and embedding placeholders
 * makes the JSON unimportable as-is. We surface a `README.md` in the
 * ZIP bundle explaining the mapping.
 *
 * Conventions:
 *   - `gross_value` is *negative* for payments (FreeAgent's signed convention)
 *   - `dated_on` is YYYY-MM-DD
 *   - `sales_tax_status` defaults to TAXABLE when scheme is vat/sales_tax,
 *     EXEMPT when scheme is 'none', omitted when 'unknown'
 *   - `ec_status` defaults to 'UK/Non-EC' — the only safe default for a
 *     non-EU-traded receipt; the user adjusts if the receipt is from
 *     within the EU and they're VAT-registered
 *
 * Marketing copy MUST NOT claim "imports into FreeAgent in one tap." This
 * file produces FreeAgent-shaped JSON. Importing requires either the
 * FreeAgent UI or a small upload script (or, eventually, OAuth — see
 * the plan doc for the "deferred not killed" decision).
 */
import type { Receipt } from '../store.ts';
import { effectiveSupplier } from '../store.ts';
import {
  attachmentFilename,
  formatCentsAsSignedPayment,
  formatRateBp,
  freeAgentTaxStatus,
  sortNewestFirst,
} from './shared.ts';

export interface FreeAgentExpensesEnvelope {
  /** Marker so an import script can detect the file shape without parsing. */
  $shape: 'freeagent-expenses-api/v1';
  /** Generated-by tag; helps an accountant tell which export produced this. */
  generated_by: string;
  /** Count of receipts at generation time. */
  count: number;
  /** Honest disclaimer: the user must supply `user` + `category` URIs. */
  notes: string[];
  expenses: FreeAgentExpense[];
}

export interface FreeAgentExpense {
  dated_on: string; // YYYY-MM-DD
  gross_value: string; // decimal, NEGATIVE for payments
  currency: string;
  sales_tax_rate?: string;
  sales_tax_value?: string;
  sales_tax_status?: 'TAXABLE' | 'EXEMPT' | 'OUT_OF_SCOPE';
  ec_status: string; // FreeAgent-required; we default to 'UK/Non-EC'
  description: string;
  receipt_reference?: string;
  /** Filename only. The attachment's `data` (base64) is NOT inlined here
   *  — callers reading this JSON should pair with the matching file in
   *  the export ZIP's `receipts/` directory. Inlining base64 PNGs into
   *  the JSON would blow it up to MB-per-receipt, which is the wrong
   *  shape for a portable file. */
  attachment_filename?: string;
}

function receiptToFreeAgentExpense(r: Receipt): FreeAgentExpense {
  const date = r.occurred_on ?? r.captured_at.slice(0, 10);
  const supplier = effectiveSupplier(r);
  const description = r.note ? `${supplier} — ${r.note}` : supplier;

  const expense: FreeAgentExpense = {
    dated_on: date,
    gross_value: r.total_cents != null ? formatCentsAsSignedPayment(r.total_cents) : '0.00',
    currency: r.currency,
    ec_status: 'UK/Non-EC',
    description,
  };

  // Tax fields — only populated when we have something meaningful.
  if (r.tax_cents != null) {
    expense.sales_tax_value = formatCentsAsSignedPayment(r.tax_cents);
  }
  if (r.tax_rate_bp != null) {
    expense.sales_tax_rate = formatRateBp(r.tax_rate_bp);
  }
  const status = freeAgentTaxStatus(r);
  if (status) {
    expense.sales_tax_status = status;
  } else if (r.tax_cents != null || r.tax_rate_bp != null) {
    // We have tax amounts but no scheme — assume TAXABLE rather than
    // omitting the field (FreeAgent will default-assume taxable anyway,
    // but being explicit avoids surprises in the import preview).
    expense.sales_tax_status = 'TAXABLE';
  }

  if (r.receipt_ref) expense.receipt_reference = r.receipt_ref;
  if (r.image_data_url) expense.attachment_filename = attachmentFilename(r);

  return expense;
}

export function receiptsToFreeAgentExpensesEnvelope(
  receipts: ReadonlyArray<Receipt>,
): FreeAgentExpensesEnvelope {
  const expenses = sortNewestFirst(receipts).map(receiptToFreeAgentExpense);
  return {
    $shape: 'freeagent-expenses-api/v1',
    generated_by: 'shippie/receipt-snap',
    count: expenses.length,
    notes: [
      'This JSON maps to FreeAgent\'s Expenses API field shape.',
      'You must supply `user` and `category` URIs at import time —',
      'Receipt Snap does not know which FreeAgent user or category to use.',
      'Pair each `attachment_filename` with the matching file in receipts/',
      'and base64-encode + attach via the API.',
      'gross_value is negative — FreeAgent\'s payment-vs-refund convention.',
    ],
    expenses,
  };
}

export function receiptsToFreeAgentJson(receipts: ReadonlyArray<Receipt>): string {
  return JSON.stringify(receiptsToFreeAgentExpensesEnvelope(receipts), null, 2) + '\n';
}
