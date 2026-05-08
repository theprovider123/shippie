/**
 * History row. Tapping opens the detail view; the card surface alone
 * shows enough at a glance to scan quickly.
 */
import { formatMoney } from '../lib/parse-receipt.ts';
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
  return (
    <button type="button" className="receipt-card" onClick={onClick}>
      <div className="receipt-card-main">
        <div className="receipt-card-vendor">{receipt.vendor || '(no vendor)'}</div>
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
