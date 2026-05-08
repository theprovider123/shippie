import { describe, expect, test } from 'bun:test';
import {
  extractDate,
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
