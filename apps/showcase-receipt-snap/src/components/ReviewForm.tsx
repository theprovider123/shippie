/**
 * Pre-filled review form. The user can correct anything; we never
 * silently save extracted values without a tap-confirm. Confidence
 * indicators tell the user which fields the OCR was less sure about
 * so they know where to look harder.
 */
import { useState } from 'react';
import type { ExtractedReceipt } from '../lib/parse-receipt.ts';
import { CATEGORIES, type Category } from '../lib/store.ts';

export interface ReviewFormValues {
  vendor: string;
  total_cents: number | null;
  currency: string;
  category: Category;
  occurred_on: string;
  note: string;
}

interface ReviewFormProps {
  extracted: ExtractedReceipt;
  rawOcrText: string;
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

export function ReviewForm({ extracted, rawOcrText, onSave, onCancel }: ReviewFormProps) {
  const [vendor, setVendor] = useState(extracted.vendor.value);
  const [totalStr, setTotalStr] = useState(centsToString(extracted.total_cents.value));
  const [currency, setCurrency] = useState(extracted.total_cents.currency);
  const [category, setCategory] = useState<Category>('food');
  const [date, setDate] = useState(extracted.occurred_on.value ?? new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  function submit() {
    onSave({
      vendor: vendor.trim(),
      total_cents: stringToCents(totalStr),
      currency,
      category,
      occurred_on: date,
      note: note.trim(),
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
      <p className="eyebrow">Review</p>
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
