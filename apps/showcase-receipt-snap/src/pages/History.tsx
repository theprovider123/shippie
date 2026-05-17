/**
 * Chronological history of saved receipts. Tap a row to view full
 * details + image. Detail view supports re-categorising and deletion.
 */
import { useState } from 'react';
import { ReceiptCard } from '../components/ReceiptCard.tsx';
import { formatMoney } from '../lib/parse-receipt.ts';
import { CATEGORIES, type Category, type Receipt } from '../lib/store.ts';

interface HistoryPageProps {
  receipts: ReadonlyArray<Receipt>;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Receipt>) => void;
}

export function HistoryPage({ receipts, onDelete, onUpdate }: HistoryPageProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? receipts.find((r) => r.id === openId) ?? null : null;

  if (open) {
    return (
      <section className="page detail-page">
        <button type="button" className="ghost back" onClick={() => setOpenId(null)}>
          ← Back
        </button>
        <h2 className="detail-vendor">{open.vendor || '(no vendor)'}</h2>
        <p className="muted small">
          {open.occurred_on ?? open.captured_at.slice(0, 10)} · {open.category}
        </p>
        <p className="detail-total">
          {open.total_cents != null ? formatMoney(open.total_cents, open.currency) : '—'}
        </p>
        {open.image_data_url ? (
          <div className="detail-image">
            <img src={open.image_data_url} alt={`${open.vendor} receipt`} />
          </div>
        ) : null}
        {open.note ? <p className="muted">{open.note}</p> : null}
        <label className="recategorise">
          <span>Re-categorise</span>
          <select
            value={open.category}
            onChange={(e) =>
              onUpdate(open.id, { category: e.target.value as Category })
            }
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {open.raw_ocr_text ? (
          <details className="raw-ocr">
            <summary>Raw OCR text</summary>
            <pre>{open.raw_ocr_text}</pre>
          </details>
        ) : null}
        <div className="form-actions">
          <button
            type="button"
            className="ghost danger"
            onClick={() => {
              if (confirm('Delete this receipt? Photo + extracted text will go too.')) {
                onDelete(open.id);
                setOpenId(null);
              }
            }}
          >
            Delete
          </button>
        </div>
      </section>
    );
  }

  if (receipts.length === 0) {
    return (
      <section className="page empty-state">
        <p className="eyebrow">History</p>
        <h2>No receipts yet</h2>
        <p className="muted">
          Snap your first receipt — it'll show up here, and you can export the lot to CSV anytime.
        </p>
      </section>
    );
  }

  return (
    <section className="page history-page">
      <p className="eyebrow">History</p>
      <ul className="receipt-list">
        {receipts.map((r) => (
          <li key={r.id}>
            <ReceiptCard receipt={r} onClick={() => setOpenId(r.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
