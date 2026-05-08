import { describe, expect, test } from 'bun:test';
import { configFor, formatCents, parseCents } from './currency.ts';

describe('currency — format', () => {
  test('formats GBP cents with two decimals', () => {
    expect(formatCents(0)).toBe('£0.00');
    expect(formatCents(1)).toBe('£0.01');
    expect(formatCents(99)).toBe('£0.99');
    expect(formatCents(100)).toBe('£1.00');
    expect(formatCents(1234)).toBe('£12.34');
    expect(formatCents(123456)).toBe('£1234.56');
  });

  test('formats negative amounts with leading minus', () => {
    expect(formatCents(-540)).toBe('-£5.40');
  });

  test('formats EUR and USD with the right symbol', () => {
    expect(formatCents(1500, 'EUR')).toBe('€15.00');
    expect(formatCents(2500, 'USD')).toBe('$25.00');
  });

  test('unknown currency falls back to its code as a prefix', () => {
    expect(formatCents(1000, 'NOK')).toBe('NOK 10.00');
  });

  test('configFor handles lowercase input', () => {
    expect(configFor('gbp').symbol).toBe('£');
  });
});

describe('currency — parse', () => {
  test('parses plain decimal forms', () => {
    expect(parseCents('12.40')).toBe(1240);
    expect(parseCents('12.4')).toBe(1240);
    expect(parseCents('0.05')).toBe(5);
    expect(parseCents('.50')).toBe(50);
  });

  test('parses whole numbers as major units', () => {
    expect(parseCents('12')).toBe(1200);
    expect(parseCents('100')).toBe(10000);
  });

  test('strips the currency symbol prefix', () => {
    expect(parseCents('£12.40')).toBe(1240);
    expect(parseCents('€7.50')).toBe(750);
    expect(parseCents('$5')).toBe(500);
  });

  test('strips currency code prefix or suffix', () => {
    expect(parseCents('GBP 12.40')).toBe(1240);
    expect(parseCents('12.40 GBP')).toBe(1240);
  });

  test('parses pence-suffix inputs', () => {
    expect(parseCents('1240p')).toBe(1240);
    expect(parseCents('50p')).toBe(50);
  });

  test('treats comma as decimal separator (continental form)', () => {
    expect(parseCents('12,40')).toBe(1240);
  });

  test('whitespace is tolerated', () => {
    expect(parseCents('  £12.40  ')).toBe(1240);
  });

  test('round-trip: parse then format', () => {
    const cases = ['1.00', '12.40', '0.05', '100.00'];
    for (const v of cases) {
      const c = parseCents(v);
      expect(c).not.toBeNull();
      expect(formatCents(c!).replace('£', '')).toBe(v);
    }
  });

  test('rejects garbage', () => {
    expect(parseCents('')).toBeNull();
    expect(parseCents('not a number')).toBeNull();
    expect(parseCents('12.345')).toBeNull(); // too many decimals
    expect(parseCents('£')).toBeNull();
  });
});
