import type { TabItem } from '../sync/tab-doc.ts';
import { formatCents } from '../lib/currency.ts';

interface Props {
  item: TabItem;
  paidByName: string | null;
  splitNames: string[];
  currency: string;
  onRemove: (id: string) => void;
}

export function ItemRow({ item, paidByName, splitNames, currency, onRemove }: Props) {
  const paid = paidByName ?? 'someone';
  const split = splitNames.length === 0 ? 'everyone' : splitNames.join(', ');
  return (
    <li className="tab-item-row">
      <div>
        <div className="tab-item-label">{item.label || 'Item'}</div>
        <div className="tab-item-meta">
          {paid} paid · split {split}
        </div>
      </div>
      <div className="tab-item-amount">{formatCents(item.amount_cents, currency)}</div>
      <button type="button" className="tab-btn tab-btn-ghost" onClick={() => onRemove(item.id)}>
        Remove
      </button>
    </li>
  );
}
