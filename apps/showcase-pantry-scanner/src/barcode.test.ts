import { describe, expect, test } from 'bun:test';
import { isValidBarcode, listKnownBarcodes, lookupByBarcode } from './barcode.ts';

describe('isValidBarcode', () => {
  test('accepts a known-valid EAN-13 with correct check digit', () => {
    expect(isValidBarcode('5012345678900')).toBe(true);
  });

  test('rejects EAN-13 with wrong check digit', () => {
    expect(isValidBarcode('5012345678901')).toBe(false);
  });

  test('rejects strings shorter than 12 digits', () => {
    expect(isValidBarcode('1234')).toBe(false);
  });

  test('rejects non-digit input', () => {
    expect(isValidBarcode('501234abcd900')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(isValidBarcode('')).toBe(false);
  });

  test('every entry in the offline catalogue passes its own check digit', () => {
    for (const code of listKnownBarcodes()) {
      expect(isValidBarcode(code)).toBe(true);
    }
  });
});

describe('lookupByBarcode', () => {
  test('returns metadata for a known item', () => {
    const item = lookupByBarcode('5012345678900');
    expect(item?.name).toBe('Pasta — penne');
  });

  test('returns null for an unknown barcode', () => {
    expect(lookupByBarcode('9999999999999')).toBe(null);
  });

  test('known items carry a default location and unit', () => {
    const item = lookupByBarcode('5012345678900');
    expect(item?.defaultUnit).toBeDefined();
    expect(item?.defaultLocation).toBeDefined();
  });
});
