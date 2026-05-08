/**
 * Receipt heuristics — pull vendor / total / date / currency from raw
 * OCR text. TrOCR and friends are mediocre on real-world receipts; the
 * UX is review-then-save, never trust extraction. These regex passes
 * exist to pre-fill the review form so the human does the smaller job
 * of confirming three fields rather than typing them from scratch.
 *
 * Each extractor returns a partial match with a confidence score
 * (0–1) so the form can render confidence indicators next to fields.
 * "0.0" means we found nothing — render the field empty + flagged.
 */

export interface ExtractedReceipt {
  vendor: { value: string; confidence: number };
  total_cents: { value: number | null; currency: string; confidence: number };
  occurred_on: { value: string | null; confidence: number };
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: 'USD',
  '£': 'GBP',
  '€': 'EUR',
  '¥': 'JPY',
};

const CURRENCY_CODES = new Set(['USD', 'GBP', 'EUR', 'JPY', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK']);

/**
 * Extract a money amount + ISO currency code from a single matched
 * fragment. Returns null on garbage. The total amount is rendered in
 * cents (or smallest unit) so we never leak floating-point error into
 * the persisted ledger.
 */
function parseMoney(raw: string): { cents: number; currency: string } | null {
  const trimmed = raw.trim();
  // Prefix or suffix currency symbol/code.
  let currency = '';
  let amountStr = trimmed;
  for (const sym of Object.keys(CURRENCY_SYMBOLS)) {
    if (trimmed.startsWith(sym)) {
      currency = CURRENCY_SYMBOLS[sym] ?? '';
      amountStr = trimmed.slice(sym.length);
      break;
    }
    if (trimmed.endsWith(sym)) {
      currency = CURRENCY_SYMBOLS[sym] ?? '';
      amountStr = trimmed.slice(0, -sym.length);
      break;
    }
  }
  if (!currency) {
    const codeMatch = trimmed.match(/\b([A-Z]{3})\b/);
    if (codeMatch && codeMatch[1] && CURRENCY_CODES.has(codeMatch[1])) {
      currency = codeMatch[1];
      amountStr = trimmed.replace(codeMatch[1], '');
    }
  }
  amountStr = amountStr.replace(/[^0-9.,-]/g, '').trim();
  if (!amountStr) return null;
  // Treat both `1,234.56` (en) and `1.234,56` (eu) by counting separators.
  const lastComma = amountStr.lastIndexOf(',');
  const lastDot = amountStr.lastIndexOf('.');
  let normalised = amountStr;
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      // EU style: 1.234,56 → drop dots, comma to dot
      normalised = amountStr.replace(/\./g, '').replace(',', '.');
    } else {
      // US/UK: 1,234.56 → drop commas
      normalised = amountStr.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    // Only commas — assume decimal if 2 digits after, else thousands
    const tail = amountStr.slice(lastComma + 1);
    if (tail.length === 2 && !tail.includes(',')) {
      normalised = amountStr.replace(',', '.');
    } else {
      normalised = amountStr.replace(/,/g, '');
    }
  }
  const num = Number.parseFloat(normalised);
  if (!Number.isFinite(num)) return null;
  return { cents: Math.round(num * 100), currency: currency || 'USD' };
}

/**
 * Find the receipt total. Strategy:
 *  1. Look for "TOTAL" / "AMOUNT DUE" / "GRAND TOTAL" keywords with a
 *     money amount nearby.
 *  2. If none, fall back to the largest money amount on the receipt
 *     (slightly less reliable but better than nothing).
 */
export function extractTotal(text: string): {
  value: number | null;
  currency: string;
  confidence: number;
} {
  const totalKeywords = /(grand\s*total|amount\s*due|total\s*due|\btotal\b|balance\s*due)/i;
  const moneyPattern = /([£$€¥]\s*-?\d{1,3}(?:[,.]?\d{3})*(?:[.,]\d{2})?|\d{1,3}(?:[,.]?\d{3})*[.,]\d{2}\s*(?:[£$€¥]|[A-Z]{3})?)/g;

  for (const line of text.split(/\n/)) {
    if (!totalKeywords.test(line)) continue;
    if (/sub\s*total/i.test(line)) continue; // skip subtotal lines
    const matches = line.match(moneyPattern);
    if (matches && matches.length > 0) {
      const last = matches[matches.length - 1];
      if (!last) continue;
      const parsed = parseMoney(last);
      if (parsed) {
        return { value: parsed.cents, currency: parsed.currency, confidence: 0.85 };
      }
    }
  }

  // Fallback — largest money amount anywhere.
  const all: { cents: number; currency: string }[] = [];
  const flat = text.match(moneyPattern) ?? [];
  for (const raw of flat) {
    const parsed = parseMoney(raw);
    if (parsed) all.push(parsed);
  }
  if (all.length === 0) return { value: null, currency: 'USD', confidence: 0 };
  let best = all[0];
  if (!best) return { value: null, currency: 'USD', confidence: 0 };
  for (const m of all) if (m.cents > best.cents) best = m;
  if (!best) return { value: null, currency: 'USD', confidence: 0 };
  return { value: best.cents, currency: best.currency, confidence: 0.4 };
}

/**
 * Find the receipt date. Recognises:
 *   - DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, DD.MM.YYYY
 *   - YYYY-MM-DD
 *   - "12 May 2026" or "May 12 2026"
 * Returns ISO YYYY-MM-DD on hit. Disambiguation between DD/MM and MM/DD
 * is impossible from text alone — we default to DD/MM (international)
 * and let the user flip it on review.
 */
export function extractDate(text: string): { value: string | null; confidence: number } {
  // ISO first — always unambiguous.
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso && iso[1] && iso[2] && iso[3]) {
    const y = Number.parseInt(iso[1], 10);
    const m = Number.parseInt(iso[2], 10);
    const d = Number.parseInt(iso[3], 10);
    if (validYmd(y, m, d)) return { value: toIso(y, m, d), confidence: 0.95 };
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const slash = text.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (slash && slash[1] && slash[2] && slash[3]) {
    const a = Number.parseInt(slash[1], 10);
    const b = Number.parseInt(slash[2], 10);
    let y = Number.parseInt(slash[3], 10);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    // If first part > 12, must be DD/MM. If second > 12, must be MM/DD.
    if (a > 12 && b <= 12 && validYmd(y, b, a)) {
      return { value: toIso(y, b, a), confidence: 0.8 };
    }
    if (b > 12 && a <= 12 && validYmd(y, a, b)) {
      return { value: toIso(y, a, b), confidence: 0.8 };
    }
    if (validYmd(y, b, a)) {
      return { value: toIso(y, b, a), confidence: 0.55 };
    }
  }

  // "12 May 2026" or "May 12, 2026"
  const months = [
    'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  ];
  const monthAlt = months.join('|');
  const dmy = text
    .toLowerCase()
    .match(new RegExp(`\\b(\\d{1,2})\\s+(${monthAlt})[a-z]*\\s+(\\d{2,4})\\b`));
  if (dmy && dmy[1] && dmy[2] && dmy[3]) {
    const d = Number.parseInt(dmy[1], 10);
    const m = months.indexOf(dmy[2]) + 1;
    let y = Number.parseInt(dmy[3], 10);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    if (validYmd(y, m, d)) return { value: toIso(y, m, d), confidence: 0.85 };
  }
  const mdy = text
    .toLowerCase()
    .match(new RegExp(`\\b(${monthAlt})[a-z]*\\s+(\\d{1,2}),?\\s+(\\d{2,4})\\b`));
  if (mdy && mdy[1] && mdy[2] && mdy[3]) {
    const m = months.indexOf(mdy[1]) + 1;
    const d = Number.parseInt(mdy[2], 10);
    let y = Number.parseInt(mdy[3], 10);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    if (validYmd(y, m, d)) return { value: toIso(y, m, d), confidence: 0.85 };
  }

  return { value: null, confidence: 0 };
}

function validYmd(y: number, m: number, d: number): boolean {
  if (y < 1980 || y > 2100) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  return true;
}

function toIso(y: number, m: number, d: number): string {
  return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
}

/**
 * Vendor heuristic. Receipts almost always print the merchant name in
 * the top 1–3 lines. Skip anything that looks numeric, address-y,
 * receipt-id-y, or short. Return the first plausible alpha-ish line.
 */
export function extractVendor(text: string): { value: string; confidence: number } {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.length < 3) continue;
    if (/^\d/.test(line)) continue; // starts with digit → likely address/phone
    if (/^[\d\s\-,.()/]+$/.test(line)) continue; // all digits/punctuation
    if (!/[A-Za-zÀ-ɏ]/.test(line)) continue; // needs at least one letter
    if (/receipt|invoice/i.test(line)) continue;
    // Strip trailing junk like "LTD", "INC" but keep
    const cleaned = line.replace(/\s+/g, ' ').slice(0, 60);
    return { value: cleaned, confidence: i === 0 ? 0.7 : 0.5 };
  }
  return { value: '', confidence: 0 };
}

/**
 * Run all extractors. Always returns shape — never throws on garbage.
 */
export function parseReceipt(text: string): ExtractedReceipt {
  return {
    vendor: extractVendor(text),
    total_cents: extractTotal(text),
    occurred_on: extractDate(text),
  };
}

/**
 * Format a cents value in a currency for display. Honest about the
 * fact that we treat all currencies as 2-decimal (JPY is wrong, but
 * receipt-snap doesn't try to be a currency engine).
 */
export function formatMoney(cents: number, currency: string): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, '0');
  const symbol = symbolFor(currency);
  return `${sign}${symbol}${whole}.${frac}`;
}

function symbolFor(currency: string): string {
  switch (currency) {
    case 'USD':
    case 'CAD':
    case 'AUD':
      return '$';
    case 'GBP':
      return '£';
    case 'EUR':
      return '€';
    case 'JPY':
      return '¥';
    default:
      return `${currency} `;
  }
}
