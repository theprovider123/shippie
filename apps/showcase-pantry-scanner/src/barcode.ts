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
 * Tiny offline catalogue for the demo. Real apps would fall back to the
 * Open Food Facts API; the showcase keeps it local so the privacy story
 * stays clean.
 */
const KNOWN: Record<string, { name: string; defaultUnit: string }> = {
  '5012345678900': { name: 'Pasta — penne', defaultUnit: 'g' },
  '0123456789012': { name: 'Olive oil', defaultUnit: 'ml' },
  '4006381333931': { name: 'Espresso beans', defaultUnit: 'g' },
};

export function lookupByBarcode(code: string): { name: string; defaultUnit: string } | null {
  return KNOWN[code] ?? null;
}

export function listKnownBarcodes(): readonly string[] {
  return Object.keys(KNOWN);
}
