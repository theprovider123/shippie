/**
 * Static currency conversion table for Ledger Groups.
 *
 * Values are rates relative to a notional 1 GBP. Multiplying a GBP
 * amount by these gets the foreign amount; dividing converts back.
 *
 * Frozen snapshot intentionally — pulling live rates would mean a
 * network dependency that fails offline and that we'd then have to
 * cache. For a "who owes whom" UI you just need ballpark consistency,
 * not bank-grade rates. The user can override per-group via a future
 * Settings panel.
 *
 * Snapshot date: 2026-05-19 (approximate; treat as illustrative).
 */
export const FX_BASE = 'GBP';

export const FX_RATES: Record<string, number> = {
  GBP: 1.0,
  USD: 1.27,
  EUR: 1.17,
  JPY: 199.5,
  AUD: 1.93,
  CAD: 1.74,
  CHF: 1.11,
  SEK: 13.7,
  NOK: 13.9,
  DKK: 8.74,
  INR: 106.5,
  MXN: 21.6,
  THB: 46.2,
  ZAR: 23.4,
  SGD: 1.70,
  HKD: 9.94,
  NZD: 2.11,
};

export const SUPPORTED_CURRENCIES: readonly string[] =
  Object.keys(FX_RATES) as readonly string[];

export function isSupportedCurrency(code: string): boolean {
  return code in FX_RATES;
}

/**
 * Convert `amountCents` from `from` to `to`. Uses the snapshot table.
 * Returns integer cents (rounded half-up). Unknown currencies fall
 * back to a 1:1 rate to avoid throwing inside aggregates.
 */
export function convertCents(amountCents: number, from: string, to: string): number {
  if (from === to) return amountCents;
  const fromRate = FX_RATES[from] ?? 1;
  const toRate = FX_RATES[to] ?? 1;
  const inBase = amountCents / fromRate;
  return Math.round(inBase * toRate);
}

export function formatMoney(amountCents: number, currency: string): string {
  const sign = amountCents < 0 ? '-' : '';
  const abs = Math.abs(amountCents) / 100;
  try {
    return `${sign}${new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).format(abs)}`;
  } catch {
    return `${sign}${abs.toFixed(2)} ${currency}`;
  }
}
