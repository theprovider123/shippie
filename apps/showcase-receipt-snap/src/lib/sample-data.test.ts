import { describe, expect, test } from 'bun:test';
import {
  SEED_ID_PREFIX,
  buildSampleReceipts,
  hasSampleData,
  isSampleId,
  withoutSamples,
} from './sample-data.ts';

describe('sample-data · build', () => {
  test('returns exactly 5 receipts', () => {
    const out = buildSampleReceipts(new Date('2026-05-19T12:00:00Z'));
    expect(out).toHaveLength(5);
  });

  test('all rows have seed_ prefix on id', () => {
    const out = buildSampleReceipts(new Date('2026-05-19T12:00:00Z'));
    for (const r of out) expect(r.id.startsWith(SEED_ID_PREFIX)).toBe(true);
  });

  test('covers the four required tax schemes (vat, sales_tax, unknown, none)', () => {
    const out = buildSampleReceipts(new Date('2026-05-19T12:00:00Z'));
    const schemes = new Set(out.map((r) => r.tax_scheme));
    expect(schemes.has('vat')).toBe(true);
    expect(schemes.has('sales_tax')).toBe(true);
    expect(schemes.has('unknown')).toBe(true);
    expect(schemes.has('none')).toBe(true);
  });

  test('includes at least one reimbursable + project + client receipt', () => {
    const out = buildSampleReceipts(new Date('2026-05-19T12:00:00Z'));
    expect(out.some((r) => r.reimbursable === true)).toBe(true);
    expect(out.some((r) => r.project != null)).toBe(true);
    expect(out.some((r) => r.client != null)).toBe(true);
  });

  test('dates are within the last week relative to baseDate', () => {
    const base = new Date('2026-05-19T12:00:00Z');
    const out = buildSampleReceipts(base);
    for (const r of out) {
      expect(r.occurred_on).not.toBeNull();
      const dayMs = Date.parse(`${r.occurred_on}T00:00:00Z`);
      const lag = base.getTime() - dayMs;
      expect(lag).toBeGreaterThanOrEqual(0);
      expect(lag).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
    }
  });
});

describe('sample-data · isSampleId / hasSampleData', () => {
  test('isSampleId discriminates by prefix', () => {
    expect(isSampleId('seed_coffee_01')).toBe(true);
    expect(isSampleId('rcpt_abc')).toBe(false);
    expect(isSampleId('')).toBe(false);
  });

  test('hasSampleData returns true when any seed row is present', () => {
    const sample = buildSampleReceipts(new Date('2026-05-19T12:00:00Z'));
    expect(hasSampleData(sample)).toBe(true);
    expect(hasSampleData([])).toBe(false);
  });
});

describe('sample-data · withoutSamples', () => {
  test('removes only seed rows; preserves order of real rows', () => {
    const sample = buildSampleReceipts(new Date('2026-05-19T12:00:00Z'));
    const real = sample.map((r) => ({ ...r, id: r.id.replace(SEED_ID_PREFIX, 'rcpt_') }));
    const mixed = [sample[0]!, real[0]!, sample[1]!, real[1]!];
    const cleaned = withoutSamples(mixed);
    expect(cleaned).toEqual([real[0]!, real[1]!]);
  });
});
