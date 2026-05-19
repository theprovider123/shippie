/**
 * Chronological history of saved receipts. Tap a row to view full
 * details + image. Detail view supports re-categorising and deletion.
 */
import { useState } from 'react';
import { ReceiptCard } from '../components/ReceiptCard.tsx';
import { formatMoney } from '../lib/parse-receipt.ts';
import { CATEGORIES, effectiveSupplier, type Category, type Receipt } from '../lib/store.ts';

/** Has the user filled in any accounting field worth showing? Used to
 *  decide whether the Accounting disclosure is rendered at all. Keeps
 *  the detail view tidy for Quick-mode receipts. */
function hasAccountingDetail(r: Receipt): boolean {
  return Boolean(
    r.supplier ||
      r.net_cents != null ||
      r.tax_cents != null ||
      r.tax_rate_bp != null ||
      r.payment_method ||
      r.receipt_ref ||
      r.project ||
      r.client ||
      r.reimbursable === true ||
      (r.tax_scheme && r.tax_scheme !== 'unknown'),
  );
}

function formatRateBp(bp: number): string {
  return `${(bp / 100).toFixed(2)}%`;
}

function relativeDays(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const days = Math.max(0, Math.round((Date.now() - then) / (24 * 60 * 60 * 1000)));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

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
          {open.export_status === 'exported' ? ' · exported' : ''}
        </p>
        <p className="detail-total">
          {open.total_cents != null ? formatMoney(open.total_cents, open.currency) : '—'}
        </p>
        {open.image_data_url ? (
          <div className="detail-image">
            <img src={open.image_data_url} alt={`${open.vendor} receipt`} />
          </div>
        ) : open.discarded_photo_at ? (
          <p className="muted small">
            Photo discarded {relativeDays(open.discarded_photo_at)} — receipt data still here.
          </p>
        ) : null}
        {open.note ? <p className="muted">{open.note}</p> : null}

        {hasAccountingDetail(open) ? (
          <details className="accounting-detail" open>
            <summary>Accounting fields</summary>
            <dl className="accounting-grid">
              {open.supplier ? (
                <>
                  <dt>Supplier override</dt>
                  <dd>{effectiveSupplier(open)}</dd>
                </>
              ) : null}
              {open.net_cents != null ? (
                <>
                  <dt>Net</dt>
                  <dd>{formatMoney(open.net_cents, open.currency)}</dd>
                </>
              ) : null}
              {open.tax_cents != null ? (
                <>
                  <dt>Tax / VAT</dt>
                  <dd>
                    {formatMoney(open.tax_cents, open.currency)}
                    {open.tax_rate_bp != null ? ` @ ${formatRateBp(open.tax_rate_bp)}` : ''}
                    {open.tax_scheme && open.tax_scheme !== 'unknown' ? ` (${open.tax_scheme})` : ''}
                  </dd>
                </>
              ) : null}
              {open.payment_method ? (
                <>
                  <dt>Payment method</dt>
                  <dd>{open.payment_method}</dd>
                </>
              ) : null}
              {open.receipt_ref ? (
                <>
                  <dt>Receipt #</dt>
                  <dd>
                    <code>{open.receipt_ref}</code>
                  </dd>
                </>
              ) : null}
              {open.project ? (
                <>
                  <dt>Project</dt>
                  <dd>{open.project}</dd>
                </>
              ) : null}
              {open.client ? (
                <>
                  <dt>Client</dt>
                  <dd>{open.client}</dd>
                </>
              ) : null}
              {open.reimbursable === true ? (
                <>
                  <dt>Reimbursable</dt>
                  <dd>yes</dd>
                </>
              ) : null}
            </dl>
          </details>
        ) : null}

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
