/**
 * Barcode helpers — pure parsing + validation.
 *
 * In-browser barcode scanning uses `BarcodeDetector` (Chrome / Safari 17+).
 * The pure parts are kept here so they can be unit-tested without a
 * camera. The component lazy-loads the scanner only when the user taps
 * the scan button.
 */

const EAN13_RE = /^\d{13}$/;
const UPC12_RE = /^\d{12}$/;

export function isValidBarcode(code: string): boolean {
  if (!EAN13_RE.test(code) && !UPC12_RE.test(code)) return false;
  // Mod-10 check digit.
  const digits = code.split('').map((d) => parseInt(d, 10));
  const check = digits[digits.length - 1]!;
  let sum = 0;
  for (let i = 0; i < digits.length - 1; i += 1) {
    const weight = (digits.length - 1 - i) % 2 === 0 ? 3 : 1;
    sum += digits[i]! * weight;
  }
  const expected = (10 - (sum % 10)) % 10;
  return check === expected;
}

/**
 * Tiny offline catalogue for the demo. Real apps fall back to Open Food
 * Facts via `lib/off.ts` and cache the result. The local catalogue is
 * the offline-floor: even on a plane the demo barcodes resolve cleanly.
 *
 * Entries are pantry-staples on purpose — pasta, oil, beans, oats —
 * because that's what the recipe-suggestion engine wants to match
 * against out of the box.
 */
export interface KnownProduct {
  name: string;
  defaultUnit: string;
  /** Default location guess. Helps pre-fill the location chip. */
  defaultLocation: 'fridge' | 'pantry' | 'freezer' | 'spice-rack';
  /** Days from purchase to use-by, when there's a typical shelf life. */
  shelfLifeDays?: number;
}

const KNOWN: Record<string, KnownProduct> = {
  '5012345678900': {
    name: 'Pasta — penne',
    defaultUnit: 'g',
    defaultLocation: 'pantry',
    shelfLifeDays: 720,
  },
  '0123456789014': {
    name: 'Olive oil',
    defaultUnit: 'ml',
    defaultLocation: 'pantry',
    shelfLifeDays: 540,
  },
  '4006381333937': {
    name: 'Espresso beans',
    defaultUnit: 'g',
    defaultLocation: 'pantry',
    shelfLifeDays: 60,
  },
  '5000147018936': {
    name: 'Tin tomatoes',
    defaultUnit: 'g',
    defaultLocation: 'pantry',
    shelfLifeDays: 720,
  },
  '8901058851650': {
    name: 'Rolled oats',
    defaultUnit: 'g',
    defaultLocation: 'pantry',
    shelfLifeDays: 365,
  },
  '5057545178957': {
    name: 'Greek yoghurt',
    defaultUnit: 'g',
    defaultLocation: 'fridge',
    shelfLifeDays: 14,
  },
};

export function lookupByBarcode(code: string): KnownProduct | null {
  return KNOWN[code] ?? null;
}

export function listKnownBarcodes(): readonly string[] {
  return Object.keys(KNOWN);
}
