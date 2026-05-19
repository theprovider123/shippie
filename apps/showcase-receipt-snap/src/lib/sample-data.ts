/**
 * Sample data for the "Try sample data" Settings affordance. Five fixed
 * fixture receipts that exercise the export presets cleanly:
 *   1. UK coffee with VAT detected (vat scheme, 20% rate, card)
 *   2. UK lunch with no VAT line (vat scheme defaulted unknown, cash)
 *   3. US-style sales tax receipt (sales_tax scheme, 8.25%)
 *   4. Zero-rated grocery shop (tax_scheme: 'none')
 *   5. Reimbursable client expense (project + client tagged)
 *
 * Every id is prefixed with `seed_` so `isSampleId()` can identify and
 * the "Clear sample data" button can remove only the seeded rows.
 */
import type { Receipt } from './store.ts';

export const SEED_ID_PREFIX = 'seed_';

export function isSampleId(id: string): boolean {
  return id.startsWith(SEED_ID_PREFIX);
}

export function hasSampleData(receipts: ReadonlyArray<Receipt>): boolean {
  return receipts.some((r) => isSampleId(r.id));
}

/**
 * Build the 5 sample receipts. Dates are computed relative to a base
 * date (defaults to today) so the fixture always feels "this week".
 * Pass an explicit `baseDate` from tests for deterministic output.
 */
export function buildSampleReceipts(baseDate: Date = new Date()): Receipt[] {
  const base = new Date(baseDate);
  const day = (offset: number): string => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  const isoAt = (offset: number, hours: number): string => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - offset);
    d.setUTCHours(hours, 0, 0, 0);
    return d.toISOString();
  };

  return [
    {
      id: `${SEED_ID_PREFIX}coffee_01`,
      vendor: 'Hagen Coffee',
      total_cents: 480,
      currency: 'GBP',
      category: 'coffee',
      occurred_on: day(1),
      captured_at: isoAt(1, 9),
      raw_ocr_text:
        'Hagen Coffee\n12 King St\nFlat white\nSubtotal £4.00\nVAT 20% £0.80\nTOTAL £4.80\nVISA **** 1234',
      image_data_url: null,
      note: '',
      supplier: null,
      net_cents: 400,
      tax_cents: 80,
      tax_rate_bp: 2000,
      tax_scheme: 'vat',
      payment_method: 'card',
      receipt_ref: null,
      project: null,
      client: null,
      reimbursable: false,
      export_status: 'not_exported',
      discarded_photo_at: null,
    },
    {
      id: `${SEED_ID_PREFIX}lunch_02`,
      vendor: 'Tiny Cafe',
      total_cents: 1250,
      currency: 'GBP',
      category: 'food',
      occurred_on: day(2),
      captured_at: isoAt(2, 13),
      raw_ocr_text: 'Tiny Cafe\nSandwich\nDrink\nTOTAL £12.50\nCASH £15.00\nCHANGE £2.50',
      image_data_url: null,
      note: '',
      supplier: null,
      net_cents: null,
      tax_cents: null,
      tax_rate_bp: null,
      tax_scheme: 'unknown',
      payment_method: 'cash',
      receipt_ref: null,
      project: null,
      client: null,
      reimbursable: false,
      export_status: 'not_exported',
      discarded_photo_at: null,
    },
    {
      id: `${SEED_ID_PREFIX}us_lunch_03`,
      vendor: 'Joe Coffee',
      total_cents: 2165,
      currency: 'USD',
      category: 'restaurant',
      occurred_on: day(4),
      captured_at: isoAt(4, 12),
      raw_ocr_text:
        'Joe Coffee\n2026-05-15\nSandwich $14.00\nDrink $6.00\nSubtotal $20.00\nSales Tax 8.25% $1.65\nTotal $21.65\nMASTERCARD ****5678',
      image_data_url: null,
      note: 'team lunch with client',
      supplier: null,
      net_cents: 2000,
      tax_cents: 165,
      tax_rate_bp: 825,
      tax_scheme: 'sales_tax',
      payment_method: 'card',
      receipt_ref: null,
      project: null,
      client: 'Acme Ltd',
      reimbursable: true,
      export_status: 'not_exported',
      discarded_photo_at: null,
    },
    {
      id: `${SEED_ID_PREFIX}groceries_04`,
      vendor: 'Sainsburys',
      total_cents: 2245,
      currency: 'GBP',
      category: 'groceries',
      occurred_on: day(5),
      captured_at: isoAt(5, 17),
      raw_ocr_text:
        'SAINSBURYS\nBananas £1.20\nMilk £1.50\nBread £1.80\n... 12 items\nTOTAL £22.45\nVISA Debit ****0099',
      image_data_url: null,
      note: '',
      supplier: 'Sainsbury\'s Supermarkets Ltd',
      net_cents: null,
      tax_cents: null,
      tax_rate_bp: null,
      tax_scheme: 'none',
      payment_method: 'card',
      receipt_ref: null,
      project: null,
      client: null,
      reimbursable: false,
      export_status: 'not_exported',
      discarded_photo_at: null,
    },
    {
      id: `${SEED_ID_PREFIX}taxi_05`,
      vendor: 'Cab Co.',
      total_cents: 1830,
      currency: 'GBP',
      category: 'transport',
      occurred_on: day(6),
      captured_at: isoAt(6, 20),
      raw_ocr_text:
        'CAB CO LTD\nReceipt #CR-44821\nTrip to Heathrow\nFare £15.25\nVAT @ 20.00 £3.05\nTOTAL £18.30\nCONTACTLESS',
      image_data_url: null,
      note: 'travel to client meeting',
      supplier: null,
      net_cents: 1525,
      tax_cents: 305,
      tax_rate_bp: 2000,
      tax_scheme: 'vat',
      payment_method: 'card',
      receipt_ref: 'CR-44821',
      project: 'Acme onboarding',
      client: 'Acme Ltd',
      reimbursable: true,
      export_status: 'not_exported',
      discarded_photo_at: null,
    },
  ];
}

/**
 * Strip sample rows from a receipts array. Used by "Clear sample data".
 * O(n) single pass; preserves order of real rows.
 */
export function withoutSamples(receipts: ReadonlyArray<Receipt>): Receipt[] {
  return receipts.filter((r) => !isSampleId(r.id));
}
