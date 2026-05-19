/**
 * Tests for the accounting-mode export presets (Phase D).
 *
 * Focus: the file-format shape is what the verified FreeAgent docs
 * expect. Don't test "this imports cleanly into FreeAgent" — that's
 * Phase 0 verification work (manual sandbox).
 */
import { describe, expect, test } from 'bun:test';
import type { Receipt } from '../store.ts';
import {
  ACCOUNTANT_CSV_HEADER,
  FREEAGENT_BANK_CSV_HEADER,
  receiptsToAccountantCsv,
  receiptsToBankCsv,
  receiptsToFreeAgentExpensesEnvelope,
  receiptsToFreeAgentJson,
  buildExportZip,
  attachmentFilename,
  formatCentsAsSignedPayment,
  formatRateBp,
  freeAgentTaxStatus,
  EXPORT_FORMATS,
} from './index.ts';

function r(over: Partial<Receipt> = {}): Receipt {
  return {
    id: over.id ?? 'rcpt_abc',
    vendor: over.vendor ?? 'Hagen Coffee',
    total_cents: over.total_cents ?? 2430,
    currency: over.currency ?? 'GBP',
    category: over.category ?? 'coffee',
    occurred_on: over.occurred_on ?? '2026-05-18',
    captured_at: over.captured_at ?? '2026-05-18T09:00:00Z',
    raw_ocr_text: over.raw_ocr_text ?? '',
    image_data_url: over.image_data_url ?? null,
    note: over.note ?? '',
    ...over,
  };
}

describe('exports · shared helpers', () => {
  test('formatCentsAsSignedPayment negates positive (payments are negative in FreeAgent)', () => {
    expect(formatCentsAsSignedPayment(2430)).toBe('-24.30');
    expect(formatCentsAsSignedPayment(-100)).toBe('1.00'); // refund (caller passed in a negative; flips positive)
  });

  test('formatRateBp renders basis points as decimal percent', () => {
    expect(formatRateBp(2000)).toBe('20.00');
    expect(formatRateBp(825)).toBe('8.25');
    expect(formatRateBp(0)).toBe('0.00');
  });

  test('attachmentFilename uses date + sanitised supplier + total', () => {
    const name = attachmentFilename(r({ vendor: 'Hagen Coffee', total_cents: 2430 }));
    expect(name).toBe('2026-05-18_hagen_coffee_24.30.jpg');
  });

  test('attachmentFilename falls back when total is null', () => {
    const name = attachmentFilename(r({ total_cents: null }));
    expect(name).toContain('unknown');
  });

  test('freeAgentTaxStatus maps schemes correctly', () => {
    expect(freeAgentTaxStatus(r({ tax_scheme: 'vat' }))).toBe('TAXABLE');
    expect(freeAgentTaxStatus(r({ tax_scheme: 'sales_tax' }))).toBe('TAXABLE');
    expect(freeAgentTaxStatus(r({ tax_scheme: 'none' }))).toBe('EXEMPT');
    expect(freeAgentTaxStatus(r({ tax_scheme: 'unknown' }))).toBeNull();
  });
});

describe('exports · accountant CSV', () => {
  test('emits the wide header', () => {
    expect(receiptsToAccountantCsv([])).toBe(ACCOUNTANT_CSV_HEADER + '\n');
  });

  test('renders all accounting fields', () => {
    const csv = receiptsToAccountantCsv([
      r({
        net_cents: 2025,
        tax_cents: 405,
        tax_rate_bp: 2000,
        tax_scheme: 'vat',
        payment_method: 'card',
        receipt_ref: 'INV-2891',
        project: 'Q2 reporting',
        client: 'Acme Ltd',
        reimbursable: true,
      }),
    ]);
    const [header, row] = csv.trim().split('\n');
    expect(header).toBe(ACCOUNTANT_CSV_HEADER);
    expect(row).toContain('20.25');
    expect(row).toContain('4.05');
    expect(row).toContain('20.00');
    expect(row).toContain('vat');
    expect(row).toContain('card');
    expect(row).toContain('INV-2891');
    expect(row).toContain('Q2 reporting');
    expect(row).toContain('Acme Ltd');
    expect(row).toContain('true');
  });

  test('uses effective supplier (override) and falls back to vendor', () => {
    const csv = receiptsToAccountantCsv([
      r({ id: 'a', vendor: 'HAGEN', supplier: 'Hagen Coffee Ltd' }),
      r({ id: 'b', vendor: 'JOE', supplier: null }),
    ]);
    expect(csv).toContain('Hagen Coffee Ltd');
    expect(csv).toContain('JOE');
  });

  test('escapes commas and quotes in fields per RFC 4180', () => {
    const csv = receiptsToAccountantCsv([
      r({ vendor: 'Hagen, Coffee "House"', note: 'lunch, friends' }),
    ]);
    expect(csv).toContain('"Hagen, Coffee ""House"""');
    expect(csv).toContain('"lunch, friends"');
  });

  test('reimbursable: undefined renders as empty string (not "undefined")', () => {
    const csv = receiptsToAccountantCsv([r()]);
    // No fake "undefined" string anywhere.
    expect(csv).not.toContain('undefined');
  });
});

describe('exports · FreeAgent Expenses API JSON', () => {
  test('envelope has shape marker + count + notes', () => {
    const env = receiptsToFreeAgentExpensesEnvelope([r()]);
    expect(env.$shape).toBe('freeagent-expenses-api/v1');
    expect(env.count).toBe(1);
    expect(env.notes.length).toBeGreaterThan(0);
    expect(env.notes.some((n) => n.includes('Expenses API'))).toBe(true);
    expect(env.notes.some((n) => n.includes('gross_value is negative'))).toBe(true);
  });

  test('gross_value is NEGATIVE for payments (FreeAgent convention)', () => {
    const env = receiptsToFreeAgentExpensesEnvelope([r({ total_cents: 2430 })]);
    expect(env.expenses[0]?.gross_value).toBe('-24.30');
  });

  test('tax fields populated when scheme is vat/sales_tax', () => {
    const env = receiptsToFreeAgentExpensesEnvelope([
      r({ tax_cents: 405, tax_rate_bp: 2000, tax_scheme: 'vat' }),
    ]);
    const exp = env.expenses[0];
    expect(exp?.sales_tax_value).toBe('-4.05');
    expect(exp?.sales_tax_rate).toBe('20.00');
    expect(exp?.sales_tax_status).toBe('TAXABLE');
  });

  test('tax_scheme: none maps to sales_tax_status: EXEMPT', () => {
    const env = receiptsToFreeAgentExpensesEnvelope([r({ tax_scheme: 'none' })]);
    expect(env.expenses[0]?.sales_tax_status).toBe('EXEMPT');
  });

  test('ec_status defaults to UK/Non-EC (FreeAgent-required field)', () => {
    const env = receiptsToFreeAgentExpensesEnvelope([r()]);
    expect(env.expenses[0]?.ec_status).toBe('UK/Non-EC');
  });

  test('attachment_filename included when image present', () => {
    const env = receiptsToFreeAgentExpensesEnvelope([
      r({ image_data_url: 'data:image/jpeg;base64,abc' }),
    ]);
    expect(env.expenses[0]?.attachment_filename).toContain('hagen_coffee');
  });

  test('attachment_filename omitted when photo discarded', () => {
    const env = receiptsToFreeAgentExpensesEnvelope([r({ image_data_url: null })]);
    expect(env.expenses[0]?.attachment_filename).toBeUndefined();
  });

  test('JSON stringifies cleanly + ends with newline', () => {
    const json = receiptsToFreeAgentJson([r()]);
    expect(json.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(json);
    expect(parsed.$shape).toBe('freeagent-expenses-api/v1');
  });
});

describe('exports · FreeAgent bank CSV', () => {
  test('emits the documented header', () => {
    expect(receiptsToBankCsv([])).toBe(FREEAGENT_BANK_CSV_HEADER + '\n');
    expect(FREEAGENT_BANK_CSV_HEADER).toBe('dated_on,description,amount,fitid,transaction_type');
  });

  test('amount is NEGATIVE (outgoing) and fitid is the receipt id', () => {
    const csv = receiptsToBankCsv([r({ id: 'rcpt_xyz', total_cents: 2430 })]);
    const row = csv.trim().split('\n')[1];
    expect(row).toContain('-24.30');
    expect(row).toContain('rcpt_xyz');
    expect(row).toContain('OTHER');
  });

  test('description uses effective supplier + optional note', () => {
    const csv = receiptsToBankCsv([
      r({ vendor: 'HAGEN', supplier: 'Hagen Coffee Ltd', note: 'team meeting' }),
    ]);
    expect(csv).toContain('Hagen Coffee Ltd — team meeting');
  });
});

describe('exports · ZIP bundle', () => {
  test('builds a non-empty zip with the expected file list', () => {
    const zip = buildExportZip(
      [r({ image_data_url: 'data:image/jpeg;base64,Zm9vYmFy' })],
      { generatedAt: '2026-05-19T00:00:00Z' },
    );
    expect(zip.byteLength).toBeGreaterThan(0);
    // ZIP files start with the local file header signature 0x50 0x4b 0x03 0x04 ('PK..').
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
  });

  test('omits photos when includeImages: false', () => {
    const zipWith = buildExportZip([r({ image_data_url: 'data:image/jpeg;base64,Zm9v' })]);
    const zipWithout = buildExportZip(
      [r({ image_data_url: 'data:image/jpeg;base64,Zm9v' })],
      { includeImages: false },
    );
    expect(zipWith.byteLength).toBeGreaterThan(zipWithout.byteLength);
  });

  test('discarded photos do not break the bundle', () => {
    const zip = buildExportZip([r({ image_data_url: null })]);
    expect(zip.byteLength).toBeGreaterThan(0);
  });
});

describe('exports · format registry', () => {
  test('EXPORT_FORMATS lists all 5 presets', () => {
    expect(EXPORT_FORMATS.map((f) => f.id)).toEqual([
      'simple-csv',
      'accountant-csv',
      'freeagent-expenses-json',
      'freeagent-bank-csv',
      'zip',
    ]);
  });

  test('no description makes the over-claim "imports in one tap"', () => {
    // Negations like "Not a one-tap import" are fine and even
    // expected — explicit honesty about the limit.
    for (const f of EXPORT_FORMATS) {
      const desc = f.description.toLowerCase();
      expect(desc).not.toMatch(/imports? in one[\s-]?tap/);
      expect(desc).not.toMatch(/one[\s-]?tap import\b(?!\.)/); // "one-tap import." is OK if a negation follows
    }
  });
});
