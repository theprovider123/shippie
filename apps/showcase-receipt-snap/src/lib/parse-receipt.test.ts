import { describe, expect, test } from 'bun:test';
import {
  extractDate,
  extractPaymentMethod,
  extractReceiptRef,
  extractTax,
  extractTotal,
  extractVendor,
  formatMoney,
  parseReceipt,
} from './parse-receipt.ts';

describe('parse-receipt · totals', () => {
  test('extracts £ total with TOTAL keyword', () => {
    const t = extractTotal('Subtotal £20.00\nTOTAL £24.50\nThank you');
    expect(t.value).toBe(2450);
    expect(t.currency).toBe('GBP');
    expect(t.confidence).toBeGreaterThan(0.5);
  });

  test('extracts $ total with AMOUNT DUE keyword', () => {
    const t = extractTotal('Items: 3\nAMOUNT DUE $12.99\n');
    expect(t.value).toBe(1299);
    expect(t.currency).toBe('USD');
  });

  test('extracts € total with eu-style decimal', () => {
    const t = extractTotal('Total €1.234,56\n');
    expect(t.value).toBe(123456);
    expect(t.currency).toBe('EUR');
  });

  test('falls back to largest amount when no TOTAL keyword', () => {
    const t = extractTotal('Coffee $3.50\nMuffin $4.25\n$7.75 visa\n');
    expect(t.value).toBe(775);
    expect(t.confidence).toBeLessThan(0.5);
  });

  test('skips subtotal lines when picking total', () => {
    const t = extractTotal('Subtotal £18.00\nTax £2.00\nTotal £20.00\n');
    expect(t.value).toBe(2000);
  });

  test('returns null + 0 confidence when nothing parseable', () => {
    const t = extractTotal('illegible blob asdf');
    expect(t.value).toBeNull();
    expect(t.confidence).toBe(0);
  });
});

describe('parse-receipt · dates', () => {
  test('parses ISO YYYY-MM-DD with high confidence', () => {
    const d = extractDate('Date: 2026-05-04\nTotal $5');
    expect(d.value).toBe('2026-05-04');
    expect(d.confidence).toBeGreaterThan(0.9);
  });

  test('parses DD/MM/YYYY when first part > 12', () => {
    const d = extractDate('29/04/2026 14:32\n');
    expect(d.value).toBe('2026-04-29');
  });

  test('parses MM/DD/YYYY when second part > 12', () => {
    const d = extractDate('05/29/2026 14:32\n');
    expect(d.value).toBe('2026-05-29');
  });

  test('parses "12 May 2026" written form', () => {
    const d = extractDate('Issued 12 May 2026');
    expect(d.value).toBe('2026-05-12');
  });

  test('parses "May 12, 2026" written form', () => {
    const d = extractDate('Date: May 12, 2026\n');
    expect(d.value).toBe('2026-05-12');
  });

  test('expands 2-digit year correctly', () => {
    const d = extractDate('14.03.26 receipt');
    expect(d.value).toBe('2026-03-14');
  });

  test('returns null for no recognisable date', () => {
    const d = extractDate('thank you for your business');
    expect(d.value).toBeNull();
  });
});

describe('parse-receipt · vendor', () => {
  test('picks the first alpha line as vendor', () => {
    const v = extractVendor('Café Loaf\n123 High Street\nLondon SE1\nTotal £4.50');
    expect(v.value).toBe('Café Loaf');
    expect(v.confidence).toBeGreaterThan(0.5);
  });

  test('skips numeric / phone-y first lines', () => {
    const v = extractVendor('555-123-4567\nWAITROSE & PARTNERS\nKINGS CROSS');
    expect(v.value).toBe('WAITROSE & PARTNERS');
  });

  test('returns empty + 0 confidence when no plausible vendor', () => {
    const v = extractVendor('123\n456\n789');
    expect(v.value).toBe('');
    expect(v.confidence).toBe(0);
  });
});

describe('parse-receipt · combined parseReceipt', () => {
  test('extracts all fields from a typical receipt', () => {
    const text = `WAITROSE & PARTNERS
123 High Street
London SE1
14/04/2026 13:42

Croissant      £2.50
Coffee         £3.20
Subtotal       £5.70
TOTAL          £5.70

VISA ****1234`;
    const r = parseReceipt(text);
    expect(r.vendor.value).toBe('WAITROSE & PARTNERS');
    expect(r.total_cents.value).toBe(570);
    expect(r.total_cents.currency).toBe('GBP');
    expect(r.occurred_on.value).toBe('2026-04-14');
  });

  test('always returns shape on garbage input', () => {
    const r = parseReceipt('???');
    expect(r.vendor.value).toBe('');
    expect(r.total_cents.value).toBeNull();
    expect(r.occurred_on.value).toBeNull();
  });
});

describe('parse-receipt · formatMoney', () => {
  test('formats USD/GBP/EUR with proper symbol', () => {
    expect(formatMoney(1234, 'USD')).toBe('$12.34');
    expect(formatMoney(1234, 'GBP')).toBe('£12.34');
    expect(formatMoney(1234, 'EUR')).toBe('€12.34');
  });

  test('renders unknown currency code as prefix', () => {
    expect(formatMoney(500, 'CHF')).toBe('CHF 5.00');
  });

  test('handles negatives and small fractions', () => {
    expect(formatMoney(-50, 'USD')).toBe('-$0.50');
    expect(formatMoney(7, 'USD')).toBe('$0.07');
  });
});

// ──────────────────────────────────────────────────────────────────
// Accounting widening — 2026-05-19
// ──────────────────────────────────────────────────────────────────

describe('parse-receipt · extractTax (UK VAT)', () => {
  test('VAT with rate', () => {
    const out = extractTax('Subtotal £20.25\nVAT 20% £4.05\nTOTAL £24.30');
    expect(out.value).toBe(405);
    expect(out.rate_bp).toBe(2000);
    expect(out.scheme).toBe('vat');
    expect(out.confidence).toBeGreaterThan(0.8);
  });

  test('VAT @ rate variant', () => {
    const out = extractTax('VAT @ 20.00  £4.05');
    expect(out.value).toBe(405);
    expect(out.rate_bp).toBe(2000);
    expect(out.scheme).toBe('vat');
  });

  test('VAT amount without rate (lower confidence)', () => {
    const out = extractTax('VAT £4.05');
    expect(out.value).toBe(405);
    expect(out.rate_bp).toBeNull();
    expect(out.scheme).toBe('vat');
    expect(out.confidence).toBeLessThan(0.8);
    expect(out.confidence).toBeGreaterThan(0);
  });
});

describe('parse-receipt · extractTax (US Sales Tax)', () => {
  test('Sales tax with rate', () => {
    const out = extractTax('Subtotal $20.00\nSales Tax 8.25% $1.65\nTotal $21.65');
    expect(out.value).toBe(165);
    expect(out.rate_bp).toBe(825);
    expect(out.scheme).toBe('sales_tax');
  });

  test('bare "Tax" line is treated as sales_tax', () => {
    const out = extractTax('Tax $1.65');
    expect(out.value).toBe(165);
    expect(out.scheme).toBe('sales_tax');
  });
});

describe('parse-receipt · extractTax (empty / ambiguous)', () => {
  test('returns null/0 when no tax line present', () => {
    const out = extractTax('Hagen Coffee\n£3.50\nTOTAL £3.50');
    expect(out.value).toBeNull();
    expect(out.rate_bp).toBeNull();
    expect(out.scheme).toBe('unknown');
    expect(out.confidence).toBe(0);
  });

  test('skips subtotal lines even if they contain a tax keyword by accident', () => {
    // Pathological — receipt prints "subtotal" near the tax block.
    const out = extractTax('Subtotal £20.25\nVAT 20% £4.05\nTotal £24.30');
    expect(out.value).toBe(405);
  });

  test('rejects implausible rate (>50%)', () => {
    const out = extractTax('VAT 99% £100.00');
    expect(out.value).toBe(10000);
    // Rate gets nulled because 99% isn't a real VAT/sales-tax rate.
    expect(out.rate_bp).toBeNull();
  });
});

describe('parse-receipt · extractReceiptRef', () => {
  test('Invoice number', () => {
    const out = extractReceiptRef('Invoice #INV-2891\nVendor: Hagen Coffee');
    expect(out.value).toBe('INV-2891');
    expect(out.confidence).toBeGreaterThan(0.8);
  });

  test('Receipt no.', () => {
    const out = extractReceiptRef('Receipt no. RCP12345');
    expect(out.value).toBe('RCP12345');
  });

  test('Order #', () => {
    const out = extractReceiptRef('Order # ABC-1234\nThanks!');
    expect(out.value).toBe('ABC-1234');
  });

  test('Ref:', () => {
    const out = extractReceiptRef('Ref: 78934-X');
    expect(out.value).toBe('78934-X');
  });

  test('Txn ID', () => {
    const out = extractReceiptRef('TXN# 928342');
    expect(out.value).toBe('928342');
  });

  test('returns null when no reference present', () => {
    const out = extractReceiptRef('Hagen Coffee\n£3.50\nThanks for visiting');
    expect(out.value).toBeNull();
    expect(out.confidence).toBe(0);
  });

  test('rejects 2-char or shorter candidates', () => {
    const out = extractReceiptRef('Ref: AB');
    expect(out.value).toBeNull();
  });
});

describe('parse-receipt · extractPaymentMethod', () => {
  test('VISA → card (high conf)', () => {
    const out = extractPaymentMethod('VISA **** 1234\nApproved');
    expect(out.value).toBe('card');
    expect(out.confidence).toBeGreaterThan(0.85);
  });

  test('MasterCard / Mastercard → card', () => {
    expect(extractPaymentMethod('MASTERCARD').value).toBe('card');
    expect(extractPaymentMethod('master card').value).toBe('card');
  });

  test('Apple Pay / Google Pay → card', () => {
    expect(extractPaymentMethod('Paid with Apple Pay').value).toBe('card');
    expect(extractPaymentMethod('Google Pay').value).toBe('card');
  });

  test('CONTACTLESS → card', () => {
    expect(extractPaymentMethod('CONTACTLESS').value).toBe('card');
  });

  test('Cash tendered → cash', () => {
    const out = extractPaymentMethod('CASH £20.00\nCHANGE £2.50');
    expect(out.value).toBe('cash');
  });

  test('Bank transfer / BACS / SEPA → bank_transfer', () => {
    expect(extractPaymentMethod('Bank Transfer').value).toBe('bank_transfer');
    expect(extractPaymentMethod('BACS').value).toBe('bank_transfer');
    expect(extractPaymentMethod('SEPA payment').value).toBe('bank_transfer');
  });

  test('bare "CARD" → card with low confidence', () => {
    const out = extractPaymentMethod('PAYMENT: CARD');
    expect(out.value).toBe('card');
    expect(out.confidence).toBeLessThan(0.6);
  });

  test('"Gift Card" line does NOT classify as card', () => {
    // GIFT CARD is its own category — don't falsely classify.
    const out = extractPaymentMethod('Gift Card applied: -£10.00');
    expect(out.value).toBeNull();
  });

  test('returns null when nothing detected', () => {
    const out = extractPaymentMethod('Hagen Coffee\n£3.50');
    expect(out.value).toBeNull();
    expect(out.confidence).toBe(0);
  });
});

describe('parse-receipt · parseReceipt full extraction', () => {
  test('UK receipt with VAT and card', () => {
    const text = [
      'Hagen Coffee',
      '12 King St',
      'Invoice #INV-2891',
      '2026-05-19',
      'Subtotal £20.25',
      'VAT 20% £4.05',
      'TOTAL £24.30',
      'VISA **** 1234',
    ].join('\n');
    const out = parseReceipt(text);
    expect(out.vendor.value).toContain('Hagen');
    expect(out.total_cents.value).toBe(2430);
    expect(out.total_cents.currency).toBe('GBP');
    expect(out.occurred_on.value).toBe('2026-05-19');
    expect(out.tax?.value).toBe(405);
    expect(out.tax?.rate_bp).toBe(2000);
    expect(out.tax?.scheme).toBe('vat');
    expect(out.receipt_ref?.value).toBe('INV-2891');
    expect(out.payment_method?.value).toBe('card');
  });

  test('US receipt with sales tax and cash', () => {
    const text = [
      'Joe Coffee',
      '2026-05-19',
      'Subtotal $20.00',
      'Tax 8.25% $1.65',
      'Total $21.65',
      'CASH $25.00',
      'CHANGE $3.35',
    ].join('\n');
    const out = parseReceipt(text);
    expect(out.total_cents.value).toBe(2165);
    expect(out.tax?.scheme).toBe('sales_tax');
    expect(out.tax?.value).toBe(165);
    expect(out.payment_method?.value).toBe('cash');
  });

  test('minimal receipt (no tax, no ref, no payment) still parses core fields', () => {
    const text = 'Tiny Cafe\n2026-05-19\nTOTAL £3.50';
    const out = parseReceipt(text);
    expect(out.vendor.value).toContain('Tiny Cafe');
    expect(out.total_cents.value).toBe(350);
    expect(out.tax?.value).toBeNull();
    expect(out.receipt_ref?.value).toBeNull();
    expect(out.payment_method?.value).toBeNull();
  });
});
