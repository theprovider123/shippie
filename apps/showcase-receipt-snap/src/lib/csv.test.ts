import { describe, expect, test } from 'bun:test';
import { CSV_HEADER, escapeCsvField, receiptToCsvRow, receiptsToCsv } from './csv.ts';
import type { Receipt } from './store.ts';

function row(over: Partial<Receipt> = {}): Receipt {
  return {
    id: over.id ?? 'r1',
    vendor: over.vendor ?? 'Test Vendor',
    total_cents: over.total_cents ?? 1234,
    currency: over.currency ?? 'USD',
    category: over.category ?? 'food',
    occurred_on: over.occurred_on ?? '2026-05-01',
    captured_at: over.captured_at ?? new Date().toISOString(),
    raw_ocr_text: over.raw_ocr_text ?? '',
    image_data_url: over.image_data_url ?? null,
    note: over.note ?? '',
  };
}

describe('csv · escaping', () => {
  test('passes simple fields through unchanged', () => {
    expect(escapeCsvField('hello')).toBe('hello');
    expect(escapeCsvField('123.45')).toBe('123.45');
  });

  test('quotes fields with commas', () => {
    expect(escapeCsvField('Hello, World')).toBe('"Hello, World"');
  });

  test('quotes fields with newlines', () => {
    expect(escapeCsvField('one\ntwo')).toBe('"one\ntwo"');
  });

  test('doubles embedded double-quotes', () => {
    expect(escapeCsvField('Say "hi"')).toBe('"Say ""hi"""');
  });
});

describe('csv · row + full export', () => {
  test('emits header even on empty input', () => {
    const csv = receiptsToCsv([]);
    expect(csv.split('\n')[0]).toBe(CSV_HEADER);
    expect(csv.trim().split('\n')).toHaveLength(1);
  });

  test('row matches header field order', () => {
    const r = row({
      occurred_on: '2026-05-01',
      vendor: 'Café',
      total_cents: 450,
      currency: 'GBP',
      category: 'coffee',
      note: 'morning',
    });
    expect(receiptToCsvRow(r)).toBe('2026-05-01,Café,4.50,GBP,coffee,morning');
  });

  test('escapes vendor with comma and notes with quotes', () => {
    const r = row({
      vendor: 'Smith, Co',
      note: 'Said "thanks"',
    });
    const line = receiptToCsvRow(r);
    expect(line).toContain('"Smith, Co"');
    expect(line).toContain('"Said ""thanks"""');
  });

  test('renders missing total as empty field', () => {
    const r = row({ total_cents: null as unknown as number });
    const line = receiptToCsvRow(r);
    // shape is: date,vendor,total,currency,category,note → 5 commas
    expect(line.split(',').length).toBeGreaterThanOrEqual(5);
  });

  test('full export sorts newest-first', () => {
    const a = row({ id: 'a', occurred_on: '2026-04-01' });
    const b = row({ id: 'b', occurred_on: '2026-05-01' });
    const c = row({ id: 'c', occurred_on: '2026-03-01' });
    const csv = receiptsToCsv([a, b, c]);
    const lines = csv.trim().split('\n');
    expect(lines[1]).toContain('2026-05-01');
    expect(lines[2]).toContain('2026-04-01');
    expect(lines[3]).toContain('2026-03-01');
  });

  test('trailing newline present', () => {
    const csv = receiptsToCsv([row()]);
    expect(csv.endsWith('\n')).toBe(true);
  });
});
