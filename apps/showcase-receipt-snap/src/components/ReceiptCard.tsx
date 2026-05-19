/**
 * History row. Tapping opens the detail view; the card surface alone
 * shows enough at a glance to scan quickly.
 *
 * Visual tells:
 *   - "sample" badge on rows the user loaded via Try-sample-data, so
 *     they're never mistaken for real receipts.
 *   - "no photo" pill on rows where the photo was discarded post-save.
 */
import { formatMoney } from '../lib/parse-receipt.ts';
import { isSampleId } from '../lib/sample-data.ts';
import type { Receipt } from '../lib/store.ts';

interface ReceiptCardProps {
  receipt: Receipt;
  onClick?: () => void;
}

export function ReceiptCard({ receipt, onClick }: ReceiptCardProps) {
  const date = receipt.occurred_on ?? receipt.captured_at.slice(0, 10);
  const totalLabel =
    receipt.total_cents != null
      ? formatMoney(receipt.total_cents, receipt.currency)
      : '—';
  const sample = isSampleId(receipt.id);
  const photoDiscarded =
    receipt.image_data_url == null && receipt.discarded_photo_at != null;
  return (
    <button type="button" className="receipt-card" onClick={onClick}>
      <div className="receipt-card-main">
        <div className="receipt-card-vendor">
          {receipt.vendor || '(no vendor)'}
          {sample ? <span className="badge badge-sample">sample</span> : null}
          {photoDiscarded ? <span className="badge badge-muted">no photo</span> : null}
        </div>
        <div className="receipt-card-meta">
          <span className="muted small">{date}</span>
          <span className="muted small">·</span>
          <span className="muted small">{receipt.category}</span>
        </div>
      </div>
      <div className="receipt-card-total">{totalLabel}</div>
    </button>
  );
}
