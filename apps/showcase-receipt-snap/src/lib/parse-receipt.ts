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
  /** Accounting extractors — added 2026-05-19. All optional in the
   *  resulting receipt row; conservative confidence floors keep us
   *  from filling fields with bad guesses. */
  tax?: {
    value: number | null;     // tax/VAT amount in smallest currency unit
    rate_bp: number | null;   // basis points (2000 = 20.00%)
    scheme: 'vat' | 'sales_tax' | 'unknown';
    confidence: number;
  };
  receipt_ref?: { value: string | null; confidence: number };
  payment_method?: {
    value: 'card' | 'cash' | 'bank_transfer' | 'other' | null;
    confidence: number;
  };
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: 'USD',
  '£': 'GBP',
  '#': 'GBP', // OCR often reads the pound sign as # on crumpled receipts.
  '€': 'EUR',
  '¥': 'JPY',
};

const CURRENCY_CODES = new Set(['USD', 'GBP', 'EUR', 'JPY', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK']);
const CURRENCY_CODE_PATTERN = 'USD|GBP|EUR|JPY|CAD|AUD|CHF|SEK|NOK|DKK';
const MONEY_PATTERN = new RegExp(
  [
    `#\\s*-?\\d{1,3}(?:[,.]?\\d{3})*(?:\\s*(?:[.,-]|\\s)\\s*\\d{2})`,
    `(?:(?:[£$€¥]|${CURRENCY_CODE_PATTERN})\\s*)-?\\d{1,3}(?:[,.]?\\d{3})*(?:\\s*(?:[.,-]|\\s)\\s*\\d{2})?`,
    `-?\\d{1,3}(?:[,.]?\\d{3})*(?:\\s*[.,-]\\s*\\d{2})(?:\\s*(?:[£$€¥]|${CURRENCY_CODE_PATTERN}))?`,
  ].join('|'),
  'gi',
);

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
    const prefixCode = trimmed.match(new RegExp(`^(${CURRENCY_CODE_PATTERN})\\s*`, 'i'));
    if (prefixCode && prefixCode[1]) {
      const code = prefixCode[1].toUpperCase();
      if (CURRENCY_CODES.has(code)) {
        currency = code;
        amountStr = trimmed.slice(prefixCode[0].length);
      }
    }
  }
  if (!currency) {
    const suffixCode = trimmed.match(new RegExp(`\\s*(${CURRENCY_CODE_PATTERN})$`, 'i'));
    if (suffixCode && suffixCode[1]) {
      const code = suffixCode[1].toUpperCase();
      if (CURRENCY_CODES.has(code)) {
        currency = code;
        amountStr = trimmed.slice(0, -suffixCode[0].length);
      }
    }
  }
  amountStr = amountStr.replace(/(\d)\s*-\s*(\d{2})$/, '$1.$2');
  amountStr = amountStr.replace(/(\d)\s+(\d{2})$/, '$1.$2');
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
  const totalKeywords = /(grand\s*total|amount\s*due|total\s*due|\btotal\b|balance\s*due|\bamt\b|\bamount\b|\bn[oa]\s*grats?\b|\bgratuity\b)/i;
  const candidates: Array<{ value: number; currency: string; confidence: number }> = [];

  for (const line of text.split(/\n/)) {
    if (!totalKeywords.test(line)) continue;
    if (/sub\s*total/i.test(line)) continue; // skip subtotal lines
    const matches = line.match(MONEY_PATTERN);
    if (matches && matches.length > 0) {
      const last = matches[matches.length - 1];
      if (!last) continue;
      const parsed = parseMoney(last);
      if (parsed) {
        const hasMarker = hasCurrencyMarker(last);
        candidates.push({
          value: parsed.cents,
          currency: hasMarker ? parsed.currency : inferCurrency(text),
          confidence: totalCandidateConfidence(line, last),
        });
      }
    }
  }
  if (candidates.length > 0) {
    return candidates.reduce((best, next) => (next.confidence >= best.confidence ? next : best));
  }

  // Fallback — largest money amount anywhere.
  const all: { cents: number; currency: string }[] = [];
  const flat = text.match(MONEY_PATTERN) ?? [];
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

function totalCandidateConfidence(line: string, rawAmount: string): number {
  let confidence = /\b(n[oa]\s*grats?|gratuity)\b/i.test(line)
    ? 0.9
    : /\b(grand\s*total|amount\s*due|total\s*due|\btotal\b|balance\s*due)\b/i.test(line)
      ? 0.85
      : 0.78;
  if (!/[.,-]\s*\d{2}\b/.test(rawAmount)) confidence -= 0.14;
  if (hasCurrencyMarker(rawAmount)) confidence += 0.03;
  return Math.max(0.55, Math.min(0.9, confidence));
}

function hasCurrencyMarker(raw: string): boolean {
  return /[£$€¥#]/.test(raw) || new RegExp(`(${CURRENCY_CODE_PATTERN})`, 'i').test(raw);
}

function inferCurrency(text: string): string {
  if (/[£#]/.test(text) || /GBP/i.test(text)) return 'GBP';
  if (/€/.test(text) || /EUR/i.test(text)) return 'EUR';
  if (/¥/.test(text) || /JPY/i.test(text)) return 'JPY';
  if (/\b(CAD|AUD|CHF|SEK|NOK|DKK)\b/i.test(text)) {
    const match = text.match(/\b(CAD|AUD|CHF|SEK|NOK|DKK)\b/i);
    return match?.[1]?.toUpperCase() ?? 'USD';
  }
  return 'USD';
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
    .map(cleanVendorLine)
    .filter(Boolean);
  let best: { value: string; confidence: number; score: number } | null = null;
  for (let i = 0; i < Math.min(12, lines.length); i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.length < 3) continue;
    if (/^\d/.test(line)) continue; // starts with digit → likely address/phone
    if (/^[\d\s\-,.()/]+$/.test(line)) continue; // all digits/punctuation
    if (!/[A-Za-zÀ-ɏ]/.test(line)) continue; // needs at least one letter
    if (/receipt|invoice/i.test(line)) continue;
    if (isVendorJunk(line)) continue;

    const cleaned = line.replace(/\s+/g, ' ').slice(0, 60);
    let score = 1.2 - i * 0.06;
    if (/\b(LTD|LIMITED|INC|LLC|PLC|CO\.?|COMPANY|CAFE|COFFEE|BAR|BARS|PUB|TAVERN|KITCHEN|GRILL|BISTRO|RESTAURANT|GOLDEN|FLEEC\w*|BROWN'S|BROWNS)\b/i.test(cleaned)) {
      score += 0.35;
    }
    if (/^[A-Z0-9 &'.-]+$/.test(cleaned) && /[A-Z]{3}/.test(cleaned)) score += 0.1;
    const confidence = Math.max(0.45, Math.min(0.75, score / 1.8));
    if (!best || score > best.score) best = { value: cleaned, confidence, score };
  }
  if (best) return { value: best.value, confidence: best.confidence };
  return { value: '', confidence: 0 };
}

function cleanVendorLine(line: string): string {
  return line
    .trim()
    .replace(/^[*\s]+|[*\s]+$/g, '')
    .replace(/^[^A-Za-zÀ-ɏ0-9]+|[^A-Za-zÀ-ɏ0-9]+$/g, '')
    .replace(/\s+/g, ' ');
}

function isVendorJunk(line: string): boolean {
  const upper = line.toUpperCase();
  const letters = upper.match(/[A-ZÀ-ɏ]/g)?.length ?? 0;
  const oneLetterTokens = upper.split(/\s+/).filter((token) => /^[A-Z]$/.test(token)).length;
  if (/[\\|]/.test(line) && letters < 8) return true;
  if (oneLetterTokens > 0 && letters <= 6) return true;
  if (/\b(BARCLAYS|VISA|MASTERCARD|MASTER CARD|AMEX|CARDHOLDER|CUSTOMER COPY|MERCHANT COPY)\b/.test(upper)) return true;
  if (/\b(AID|APP PSN|AUTH|AUTHORISED|AUTHORIZED|VERIFIED BY DEVICE|RESPONSE CODE|PLEASE RETAIN)\b/.test(upper)) return true;
  if (/\b(TILL|TABLE|CASHIER|SERVER|OPERATOR|TERMINAL|ACC NO|VAT NO|RECEIPT NO|DATE|TIME)\b/.test(upper)) return true;
  if (/\bTI(?:LL)?\s*\d+\s*BAR\b/.test(upper)) return true;
  if (/\b(LONDON|ROAD|STREET|LANE|AVENUE|HIGH ST|POSTCODE)\b/.test(upper) && !/\b(LTD|LIMITED|CAFE|BAR|RESTAURANT)\b/.test(upper)) return true;
  if (/^[A-Z]{1,3}\d[\dA-Z\s]{3,}$/.test(upper)) return true;
  return false;
}

/**
 * Tax / VAT detection. Conservative — only fires when the line is clearly
 * a tax line (keyword + amount, optionally + rate). Returns `null` values
 * with confidence 0 when nothing is found rather than guessing. UK
 * receipts typically print `VAT 20%` or `VAT @ 20.00 £4.05`; US receipts
 * print `Tax 8.25% $1.65` or `Sales Tax $1.65`.
 *
 * Rate is returned as basis points (2000 = 20.00%) for lossless integer
 * persistence — same convention the schema uses.
 */
export function extractTax(text: string): {
  value: number | null;
  rate_bp: number | null;
  scheme: 'vat' | 'sales_tax' | 'unknown';
  confidence: number;
} {
  const NONE = { value: null, rate_bp: null, scheme: 'unknown' as const, confidence: 0 };

  // Money pattern same as extractTotal — find amounts on tax-like lines.
  // Rate pattern: 20%, 20.00%, 5% etc.
  const ratePattern = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/;

  // Iterate lines, find clear tax lines.
  for (const line of text.split(/\n/)) {
    // Skip subtotals — they aren't the tax.
    if (/sub\s*total/i.test(line)) continue;

    // Two schemes:
    //   VAT — UK / EU
    //   Sales Tax — US (and "Tax" alone — ambiguous but usually sales tax)
    const isVat = /\bvat\b/i.test(line);
    const isSalesTax = /\b(sales\s*tax|tax)\b/i.test(line);
    if (!isVat && !isSalesTax) continue;

    // Try to pull a money amount.
    // Rate is optional. When present we believe more.
    // Two forms accepted:
    //   "VAT 20%" / "8.25%" — explicit percent sign
    //   "VAT @ 20.00"        — `@` prefix (UK convention, percent often elided)
    let rateBp: number | null = null;
    const rateMatch = line.match(ratePattern);
    if (rateMatch && rateMatch[1]) {
      const ratePct = Number.parseFloat(rateMatch[1].replace(',', '.'));
      if (Number.isFinite(ratePct) && ratePct >= 0 && ratePct <= 50) {
        rateBp = Math.round(ratePct * 100);
      }
    } else {
      const atMatch = line.match(/@\s*(\d{1,2}(?:[.,]\d{1,2})?)\b/);
      if (atMatch && atMatch[1]) {
        const ratePct = Number.parseFloat(atMatch[1].replace(',', '.'));
        if (Number.isFinite(ratePct) && ratePct >= 0 && ratePct <= 50) {
          rateBp = Math.round(ratePct * 100);
        }
      }
    }

    const moneyMatches = line.match(MONEY_PATTERN);
    if (!moneyMatches || moneyMatches.length === 0) {
      if (isVat && rateBp != null && /\bincluded\b/i.test(line)) {
        return {
          value: null,
          rate_bp: rateBp,
          scheme: 'vat',
          confidence: 0.45,
        };
      }
      continue;
    }
    const lastMoney = moneyMatches[moneyMatches.length - 1];
    if (!lastMoney) continue;
    const parsed = parseMoney(lastMoney);
    if (!parsed) continue;

    return {
      value: parsed.cents,
      rate_bp: rateBp,
      scheme: isVat ? 'vat' : 'sales_tax',
      // Higher confidence when a rate was found AND it's plausible.
      confidence: rateBp != null ? 0.85 : 0.65,
    };
  }

  return NONE;
}

/**
 * Receipt reference / invoice number / order number. We look for common
 * label prefixes followed by a token of digits / letters / dashes.
 *
 * Conservative: only fires when the prefix is unambiguous. "Receipt:" or
 * "Invoice #" is fine; bare digits floating in the OCR text aren't,
 * because OCR garbles plenty of things into digit-only blobs.
 */
export function extractReceiptRef(text: string): { value: string | null; confidence: number } {
  // Patterns ordered most-specific → least-specific.
  // (?: ) groups don't capture; capture group 1 is the value.
  const patterns: Array<{ re: RegExp; conf: number }> = [
    { re: /\binvoice\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-_/]{2,20})\b/i, conf: 0.85 },
    { re: /\breceipt\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-_/]{2,20})\b/i, conf: 0.85 },
    { re: /\border\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-_/]{2,20})\b/i, conf: 0.85 },
    { re: /\bref(?:erence)?\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-_/]{2,20})\b/i, conf: 0.8 },
    { re: /\btxn\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-_/]{2,20})\b/i, conf: 0.8 },
  ];

  for (const { re, conf } of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      // Reject obvious junk: pure dashes or anything starting with a
      // common-word prefix we accidentally captured.
      const candidate = m[1].trim();
      if (/^-+$/.test(candidate)) continue;
      if (candidate.length < 3) continue;
      return { value: candidate, confidence: conf };
    }
  }

  return { value: null, confidence: 0 };
}

/**
 * Payment method hints. Strong signals: card-network keywords (VISA,
 * MASTERCARD, AMEX, CONTACTLESS), explicit `CASH` / `CHANGE`, or
 * `BANK TRANSFER`. We don't try to recover from ambiguous shorthand
 * ("CARD" alone could be anything — we lean `card` but with low conf).
 */
export function extractPaymentMethod(text: string): {
  value: 'card' | 'cash' | 'bank_transfer' | 'other' | null;
  confidence: number;
} {
  const upper = text.toUpperCase();
  // Card network — strong card hint.
  if (/\b(VISA|MASTERCARD|MASTER\s*CARD|AMEX|AMERICAN\s*EXPRESS|DISCOVER|MAESTRO|CONTACTLESS|APPLE\s*PAY|GOOGLE\s*PAY|GPAY|EFT)\b/.test(upper)) {
    return { value: 'card', confidence: 0.9 };
  }
  if (/\b(AUTH\s*CODE|AUTHORISED|AUTHORIZED|VERIFIED\s+BY\s+DEVICE|CARDHOLDER\s+COPY)\b/.test(upper)) {
    return { value: 'card', confidence: 0.8 };
  }
  // Explicit CASH / CHANGE GIVEN.
  if (/\bCASH\b/.test(upper) && /\bCHANGE\b|TENDERED|GIVEN/.test(upper)) {
    return { value: 'cash', confidence: 0.85 };
  }
  if (/\bCASH\s+(?:PAYMENT|RECEIVED)?\b/.test(upper)) {
    return { value: 'cash', confidence: 0.7 };
  }
  // Bank transfer / direct debit.
  if (/\b(BANK\s*TRANSFER|BACS|SEPA|ACH|WIRE\s*TRANSFER)\b/.test(upper)) {
    return { value: 'bank_transfer', confidence: 0.85 };
  }
  // Weak `CARD` mention — last-resort hint.
  if (/\bCARD\b/.test(upper) && !/GIFT\s*CARD/.test(upper)) {
    return { value: 'card', confidence: 0.55 };
  }
  return { value: null, confidence: 0 };
}

/**
 * Run all extractors. Always returns shape — never throws on garbage.
 * Accounting extractors (tax, receipt_ref, payment_method) are included
 * but their values may be null/empty when the OCR text doesn't carry
 * enough signal.
 */
export function parseReceipt(text: string): ExtractedReceipt {
  return {
    vendor: extractVendor(text),
    total_cents: extractTotal(text),
    occurred_on: extractDate(text),
    tax: extractTax(text),
    receipt_ref: extractReceiptRef(text),
    payment_method: extractPaymentMethod(text),
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
