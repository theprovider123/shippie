/**
 * Pre-filled review form. The user can correct anything; we never
 * silently save extracted values without a tap-confirm. Confidence
 * indicators tell the user which fields the OCR was less sure about
 * so they know where to look harder.
 *
 * Two modes (2026-05-19 accounting widening):
 *   - 'quick'     — vendor, total, date, category, note (today's fields)
 *   - 'accounting'— Quick fields + net/tax/payment-method/receipt-ref/
 *                   project/client/reimbursable/supplier override.
 *                   Accounting-only fields live behind a disclosure so
 *                   the form stays short when those fields are empty.
 */
import { useMemo, useState } from 'react';
import type { ExtractedReceipt } from '../lib/parse-receipt.ts';
import {
  CATEGORIES,
  type Category,
  type PaymentMethod,
  type TaxScheme,
} from '../lib/store.ts';

export type ReviewMode = 'quick' | 'accounting';

export interface ReviewFormValues {
  vendor: string;
  total_cents: number | null;
  currency: string;
  category: Category;
  occurred_on: string;
  note: string;
  // Accounting fields — always present on the values payload; ignored by
  // callers that don't care, populated when the user has filled them.
  supplier: string | null;
  net_cents: number | null;
  tax_cents: number | null;
  tax_rate_bp: number | null;
  tax_scheme: TaxScheme;
  payment_method: PaymentMethod | null;
  receipt_ref: string | null;
  project: string | null;
  client: string | null;
  reimbursable: boolean;
}

interface ReviewFormProps {
  extracted: ExtractedReceipt;
  rawOcrText: string;
  mode?: ReviewMode;
  onSave: (values: ReviewFormValues) => void;
  onCancel: () => void;
}

function centsToString(cents: number | null): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}

function stringToCents(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const num = Number.parseFloat(trimmed.replace(',', '.'));
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

function rateBpToString(bp: number | null): string {
  if (bp == null) return '';
  // Render in percent with two decimals (2000 → "20.00").
  return (bp / 100).toFixed(2);
}

function stringToRateBp(s: string): number | null {
  const trimmed = s.trim().replace('%', '');
  if (!trimmed) return null;
  const num = Number.parseFloat(trimmed.replace(',', '.'));
  if (!Number.isFinite(num)) return null;
  if (num < 0 || num > 50) return null;
  return Math.round(num * 100);
}

const CONFIDENCE_LABELS: Array<{ min: number; label: string; tone: 'low' | 'med' | 'high' }> = [
  { min: 0.7, label: 'looks right', tone: 'high' },
  { min: 0.4, label: 'check this', tone: 'med' },
  { min: 0, label: 'not sure', tone: 'low' },
];

function confidenceTag(confidence: number) {
  for (const tier of CONFIDENCE_LABELS) {
    if (confidence >= tier.min) {
      return <span className={`confidence ${tier.tone}`}>{tier.label}</span>;
    }
  }
  return null;
}

export function ReviewForm({
  extracted,
  rawOcrText,
  mode = 'quick',
  onSave,
  onCancel,
}: ReviewFormProps) {
  // Core fields (mode-independent).
  const [vendor, setVendor] = useState(extracted.vendor.value);
  const [totalStr, setTotalStr] = useState(centsToString(extracted.total_cents.value));
  const [currency, setCurrency] = useState(extracted.total_cents.currency);
  const [category, setCategory] = useState<Category>('food');
  const [date, setDate] = useState(
    extracted.occurred_on.value ?? new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState('');

  // Accounting fields — pre-filled from the parser's optional extractors.
  // We initialise these even in Quick mode (cheap, and a later toggle to
  // Accounting mode will surface the pre-fills automatically).
  const initialTax = extracted.tax ?? null;
  const initialRef = extracted.receipt_ref?.value ?? null;
  const initialPayment = extracted.payment_method?.value ?? null;
  const initialTotalCents = extracted.total_cents.value;
  const initialNetCents = useMemo(() => {
    if (initialTotalCents == null || !initialTax?.value) return null;
    return initialTotalCents - initialTax.value;
  }, [initialTotalCents, initialTax]);

  const [supplier, setSupplier] = useState<string>('');
  const [netStr, setNetStr] = useState(centsToString(initialNetCents));
  const [taxStr, setTaxStr] = useState(centsToString(initialTax?.value ?? null));
  const [taxRateStr, setTaxRateStr] = useState(rateBpToString(initialTax?.rate_bp ?? null));
  const [taxScheme, setTaxScheme] = useState<TaxScheme>(
    initialTax?.scheme === 'sales_tax' || initialTax?.scheme === 'vat'
      ? initialTax.scheme
      : 'unknown',
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>(initialPayment ?? '');
  const [receiptRef, setReceiptRef] = useState(initialRef ?? '');
  const [project, setProject] = useState('');
  const [client, setClient] = useState('');
  const [reimbursable, setReimbursable] = useState(false);

  // In accounting mode the disclosure stays open by default so users
  // see the wider form immediately. In quick mode it stays closed.
  const [showAccountingExtras, setShowAccountingExtras] = useState(mode === 'accounting');

  function submit() {
    onSave({
      vendor: vendor.trim(),
      total_cents: stringToCents(totalStr),
      currency,
      category,
      occurred_on: date,
      note: note.trim(),
      supplier: supplier.trim() ? supplier.trim() : null,
      net_cents: stringToCents(netStr),
      tax_cents: stringToCents(taxStr),
      tax_rate_bp: stringToRateBp(taxRateStr),
      tax_scheme: taxScheme,
      payment_method: paymentMethod || null,
      receipt_ref: receiptRef.trim() ? receiptRef.trim() : null,
      project: project.trim() ? project.trim() : null,
      client: client.trim() ? client.trim() : null,
      reimbursable,
    });
  }

  // Honest summary of what we got + missed.
  const missing: string[] = [];
  if (!extracted.vendor.value) missing.push('vendor');
  if (extracted.total_cents.value == null) missing.push('total');
  if (!extracted.occurred_on.value) missing.push('date');

  return (
    <form
      className="review-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="eyebrow">Review · {mode === 'accounting' ? 'accounting mode' : 'quick mode'}</p>
      {missing.length > 0 ? (
        <p className="muted small">
          Couldn't read {missing.join(' / ')} cleanly — fill in what's missing.
        </p>
      ) : (
        <p className="muted small">
          Pre-filled from the photo. Tap any field to correct it before saving.
        </p>
      )}

      <label>
        <span className="label-row">
          <span>Vendor</span>
          {confidenceTag(extracted.vendor.confidence)}
        </span>
        <input
          type="text"
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          placeholder="e.g. Café Loaf"
        />
      </label>

      <div className="row">
        <label className="grow">
          <span className="label-row">
            <span>Total</span>
            {confidenceTag(extracted.total_cents.confidence)}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={totalStr}
            onChange={(e) => setTotalStr(e.target.value)}
            placeholder="0.00"
          />
        </label>
        <label className="currency">
          <span>Currency</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
            <option value="EUR">EUR</option>
            <option value="JPY">JPY</option>
            <option value="CAD">CAD</option>
            <option value="AUD">AUD</option>
          </select>
        </label>
      </div>

      <div className="row">
        <label className="grow">
          <span className="label-row">
            <span>Date</span>
            {confidenceTag(extracted.occurred_on.confidence)}
          </span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="currency">
          <span>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        <span>Note (optional)</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="business lunch, etc."
        />
      </label>

      {mode === 'accounting' || (extracted.tax?.value ?? null) != null ? (
        <details
          className="accounting-extras"
          open={showAccountingExtras}
          onToggle={(e) => setShowAccountingExtras((e.target as HTMLDetailsElement).open)}
        >
          <summary>Accounting fields</summary>
          <p className="muted small">Net, tax, payment method, and receipt reference — optional, kept for bookkeeping export.</p>

          <label>
            <span>Supplier <span className="muted small">(override — falls back to vendor)</span></span>
            <input
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder={vendor || 'e.g. Hagen Coffee Ltd'}
            />
          </label>

          <div className="row">
            <label className="grow">
              <span>Net (pre-tax)</span>
              <input
                type="text"
                inputMode="decimal"
                value={netStr}
                onChange={(e) => setNetStr(e.target.value)}
                placeholder="0.00"
              />
            </label>
            <label className="grow">
              <span className="label-row">
                <span>Tax / VAT</span>
                {extracted.tax ? confidenceTag(extracted.tax.confidence) : null}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={taxStr}
                onChange={(e) => setTaxStr(e.target.value)}
                placeholder="0.00"
              />
            </label>
          </div>

          <div className="row">
            <label className="grow">
              <span>Rate (%)</span>
              <input
                type="text"
                inputMode="decimal"
                value={taxRateStr}
                onChange={(e) => setTaxRateStr(e.target.value)}
                placeholder="20.00"
              />
            </label>
            <label className="currency">
              <span>Scheme</span>
              <select
                value={taxScheme}
                onChange={(e) => setTaxScheme(e.target.value as TaxScheme)}
              >
                <option value="unknown">unknown</option>
                <option value="vat">VAT</option>
                <option value="sales_tax">sales tax</option>
                <option value="none">none</option>
              </select>
            </label>
          </div>

          <div className="row">
            <label className="grow">
              <span className="label-row">
                <span>Payment method</span>
                {extracted.payment_method
                  ? confidenceTag(extracted.payment_method.confidence)
                  : null}
              </span>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | '')}
              >
                <option value="">(not set)</option>
                <option value="card">card</option>
                <option value="cash">cash</option>
                <option value="bank_transfer">bank transfer</option>
                <option value="other">other</option>
              </select>
            </label>
            <label className="grow">
              <span className="label-row">
                <span>Receipt #</span>
                {extracted.receipt_ref ? confidenceTag(extracted.receipt_ref.confidence) : null}
              </span>
              <input
                type="text"
                value={receiptRef}
                onChange={(e) => setReceiptRef(e.target.value)}
                placeholder="INV-2891"
              />
            </label>
          </div>

          <div className="row">
            <label className="grow">
              <span>Project</span>
              <input
                type="text"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="optional"
              />
            </label>
            <label className="grow">
              <span>Client</span>
              <input
                type="text"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="optional"
              />
            </label>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={reimbursable}
              onChange={(e) => setReimbursable(e.target.checked)}
            />
            <span>Reimbursable expense (employee → company)</span>
          </label>
        </details>
      ) : null}

      {rawOcrText ? (
        <details className="raw-ocr">
          <summary>Show raw text</summary>
          <pre>{rawOcrText || '(empty)'}</pre>
        </details>
      ) : null}

      <div className="form-actions">
        <button type="button" onClick={onCancel} className="ghost">
          Discard
        </button>
        <button type="submit" className="primary">
          Save expense
        </button>
      </div>
    </form>
  );
}
