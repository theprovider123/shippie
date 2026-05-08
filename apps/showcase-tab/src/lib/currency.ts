/**
 * Currency formatting + parsing.
 *
 * Storage is always integer cents (or pence, or the smallest minor unit
 * — we treat everything as 100ths of the major unit). Two-decimal
 * minor-unit currencies only for now: GBP, EUR, USD, AUD, CAD, JPY-no
 * (JPY is whole-yen → we'd need to special-case; out of scope for
 * launch).
 *
 * Honest about rounding: `formatCents(123)` returns `"£1.23"`. Across
 * many items, balance arithmetic at the cent level may show a stray
 * 1-2 pence leftover that the netting algorithm will allocate to one
 * person — we surface that in the UI rather than hide it.
 */

export interface CurrencyConfig {
  code: string;
  symbol: string;
}

const KNOWN: Record<string, CurrencyConfig> = {
  GBP: { code: 'GBP', symbol: '£' },
  EUR: { code: 'EUR', symbol: '€' },
  USD: { code: 'USD', symbol: '$' },
  AUD: { code: 'AUD', symbol: 'A$' },
  CAD: { code: 'CAD', symbol: 'C$' },
};

export function configFor(code: string): CurrencyConfig {
  return KNOWN[code.toUpperCase()] ?? { code: code.toUpperCase(), symbol: code.toUpperCase() + ' ' };
}

export function listCurrencies(): CurrencyConfig[] {
  return Object.values(KNOWN);
}

/**
 * Format an integer-cents amount in the given currency. Always two
 * decimal places. Negative amounts get a leading minus sign before the
 * symbol.
 */
export function formatCents(amount_cents: number, currency = 'GBP'): string {
  const cfg = configFor(currency);
  const negative = amount_cents < 0;
  const abs = Math.abs(Math.round(amount_cents));
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  const body = `${cfg.symbol}${major}.${minor.toString().padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

/**
 * Parse a free-text amount into integer cents. Accepts:
 *   - "12.40"   → 1240
 *   - "£12.40"  → 1240
 *   - "12,40"   → 1240   (continental decimal)
 *   - "12"      → 1200
 *   - "1240p"   → 1240   (already pence)
 *   - "  12.4 " → 1240
 *
 * Returns null on garbage input.
 */
export function parseCents(input: string): number | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Strip leading currency symbols + trailing currency codes.
  const stripped = trimmed
    .replace(/^[£€$]\s*/, '')
    .replace(/^(GBP|EUR|USD|AUD|CAD)\s*/i, '')
    .replace(/\s*(GBP|EUR|USD|AUD|CAD)\s*$/i, '')
    .trim();

  // "1240p" / "1240P" — already pence.
  const penceMatch = stripped.match(/^(-?\d+)\s*p$/i);
  if (penceMatch) {
    return parseInt(penceMatch[1]!, 10);
  }

  // Normalise comma to dot. We don't try to handle thousands
  // separators — this is bill-splitting, not accounting; if someone
  // writes "1,234.56" they're an outlier and we'll punt.
  const normalised = stripped.replace(/,/g, '.');

  // Plain integer (no decimal): treat as whole units.
  if (/^-?\d+$/.test(normalised)) {
    const n = parseInt(normalised, 10);
    return n * 100;
  }

  // Decimal form. Allow 0, 1, or 2 decimal digits.
  const m = normalised.match(/^(-?)(\d+)\.(\d{1,2})$/);
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    const major = parseInt(m[2]!, 10);
    const minorRaw = m[3]!;
    const minor = parseInt(minorRaw.padEnd(2, '0'), 10);
    return sign * (major * 100 + minor);
  }

  // Edge: ".50" → 50p
  const m2 = normalised.match(/^(-?)\.(\d{1,2})$/);
  if (m2) {
    const sign = m2[1] === '-' ? -1 : 1;
    const minor = parseInt(m2[2]!.padEnd(2, '0'), 10);
    return sign * minor;
  }

  return null;
}
